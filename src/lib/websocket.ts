import { Elysia, t } from "elysia";
import { subscribeToStatus, subscribeToComplete } from "./redis";
import type { StatusMessage, CompleteMessage } from "./redis";

// Use 'any' for WebSocket since Elysia uses ServerWebSocket which is different from standard WebSocket
type WS = any;

// Store WebSocket connections by job ID
const jobSubscriptions = new Map<string, Set<WS>>();

// Store all active connections for broadcast
const allConnections = new Set<WS>();

// WebSocket message types
interface WSMessage {
  type: "subscribe" | "unsubscribe" | "ping";
  job_id?: string;
}

interface WSOutgoingMessage {
  type: "status" | "complete" | "error" | "subscribed" | "pong";
  job_id?: string;
  data?: unknown;
  message?: string;
}

// Send message to specific WebSocket
function sendMessage(ws: WS, message: WSOutgoingMessage): void {
  try {
    if (ws.readyState === 1) { // WebSocket.OPEN = 1
      ws.send(JSON.stringify(message));
    }
  } catch (error) {
    console.error("Error sending WebSocket message:", error);
  }
}

// Broadcast to all subscribers of a job
function broadcastToJob(jobId: string, message: WSOutgoingMessage): void {
  const subscribers = jobSubscriptions.get(jobId);
  if (subscribers) {
    subscribers.forEach((ws) => sendMessage(ws, message));
  }
}

// Handle status updates from Redis
function handleStatusUpdate(status: StatusMessage): void {
  broadcastToJob(status.job_id, {
    type: "status",
    job_id: status.job_id,
    data: status,
  });
}

// Handle completion events from Redis
function handleCompleteUpdate(complete: CompleteMessage): void {
  broadcastToJob(complete.job_id, {
    type: "complete",
    job_id: complete.job_id,
    data: complete,
  });
}

// Subscribe a WebSocket to a job
function subscribeToJob(ws: WS, jobId: string): void {
  if (!jobSubscriptions.has(jobId)) {
    jobSubscriptions.set(jobId, new Set());
  }
  jobSubscriptions.get(jobId)!.add(ws);
  sendMessage(ws, { type: "subscribed", job_id: jobId, message: `Subscribed to job ${jobId}` });
}

// Unsubscribe a WebSocket from a job
function unsubscribeFromJob(ws: WS, jobId: string): void {
  const subscribers = jobSubscriptions.get(jobId);
  if (subscribers) {
    subscribers.delete(ws);
    if (subscribers.size === 0) {
      jobSubscriptions.delete(jobId);
    }
  }
}

// Clean up WebSocket from all subscriptions
function cleanupConnection(ws: WS): void {
  allConnections.delete(ws);
  jobSubscriptions.forEach((subscribers, jobId) => {
    subscribers.delete(ws);
    if (subscribers.size === 0) {
      jobSubscriptions.delete(jobId);
    }
  });
}

// Initialize Redis subscriptions for WebSocket relay
export async function initWebSocketRedisRelay(): Promise<void> {
  try {
    await subscribeToStatus(handleStatusUpdate);
    await subscribeToComplete(handleCompleteUpdate);
    console.log("✅ WebSocket Redis relay initialized");
  } catch (error) {
    console.error("❌ Failed to initialize WebSocket Redis relay:", error);
  }
}

// Elysia WebSocket plugin
export const websocketPlugin = new Elysia()
  .ws("/ws", {
    body: t.Object({
      type: t.Union([t.Literal("subscribe"), t.Literal("unsubscribe"), t.Literal("ping")]),
      job_id: t.Optional(t.String()),
    }),
    open(ws) {
      allConnections.add(ws.raw);
      console.log(`🔌 WebSocket connected. Total connections: ${allConnections.size}`);
    },
    message(ws, message: WSMessage) {
      switch (message.type) {
        case "subscribe":
          if (message.job_id) {
            subscribeToJob(ws.raw, message.job_id);
          }
          break;
        case "unsubscribe":
          if (message.job_id) {
            unsubscribeFromJob(ws.raw, message.job_id);
          }
          break;
        case "ping":
          sendMessage(ws.raw, { type: "pong" });
          break;
      }
    },
    close(ws) {
      cleanupConnection(ws.raw);
      console.log(`🔌 WebSocket disconnected. Total connections: ${allConnections.size}`);
    },
  });

// Get connection stats
export function getConnectionStats(): { total: number; jobSubscriptions: number } {
  return {
    total: allConnections.size,
    jobSubscriptions: jobSubscriptions.size,
  };
}
