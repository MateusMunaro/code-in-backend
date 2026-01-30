import { createClient, RedisClientType } from "redis";

// Environment variables - configure in .env
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Redis clients
let publisherClient: RedisClientType | null = null;
let subscriberClient: RedisClientType | null = null;

// Channel names
export const CHANNELS = {
  JOB_QUEUE: "code-indexer:jobs",
  JOB_STATUS: "code-indexer:status",
  JOB_COMPLETE: "code-indexer:complete",
} as const;

// Initialize Redis connection
export async function initRedis(): Promise<void> {
  try {
    publisherClient = createClient({ url: REDIS_URL });
    subscriberClient = createClient({ url: REDIS_URL });

    publisherClient.on("error", (err) =>
      console.error("Redis Publisher Error:", err)
    );
    subscriberClient.on("error", (err) =>
      console.error("Redis Subscriber Error:", err)
    );

    await publisherClient.connect();
    await subscriberClient.connect();

    console.log("✅ Redis connected successfully");
  } catch (error) {
    console.error("❌ Failed to connect to Redis:", error);
    throw error;
  }
}

// Get publisher client
export function getPublisher(): RedisClientType {
  if (!publisherClient) {
    throw new Error("Redis publisher not initialized. Call initRedis() first.");
  }
  return publisherClient;
}

// Get subscriber client
export function getSubscriber(): RedisClientType {
  if (!subscriberClient) {
    throw new Error(
      "Redis subscriber not initialized. Call initRedis() first."
    );
  }
  return subscriberClient;
}

// Job message types
export interface JobMessage {
  job_id: string;
  repo_url: string;
  selected_model: string;
  timestamp: string;
}

export interface StatusMessage {
  job_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  message?: string;
  progress?: number;
  timestamp: string;
}

export interface CompleteMessage {
  job_id: string;
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
  timestamp: string;
}

// Publish a new job to the queue
export async function publishJob(job: JobMessage): Promise<void> {
  const publisher = getPublisher();
  await publisher.publish(CHANNELS.JOB_QUEUE, JSON.stringify(job));
  console.log(`📤 Published job ${job.job_id} to queue`);
}

// Publish job status update
export async function publishStatus(status: StatusMessage): Promise<void> {
  const publisher = getPublisher();
  await publisher.publish(CHANNELS.JOB_STATUS, JSON.stringify(status));
}

// Subscribe to status updates
export async function subscribeToStatus(
  callback: (message: StatusMessage) => void
): Promise<void> {
  const subscriber = getSubscriber();
  await subscriber.subscribe(CHANNELS.JOB_STATUS, (message) => {
    try {
      const parsed = JSON.parse(message) as StatusMessage;
      callback(parsed);
    } catch (error) {
      console.error("Error parsing status message:", error);
    }
  });
}

// Subscribe to completion events
export async function subscribeToComplete(
  callback: (message: CompleteMessage) => void
): Promise<void> {
  const subscriber = getSubscriber();
  await subscriber.subscribe(CHANNELS.JOB_COMPLETE, (message) => {
    try {
      const parsed = JSON.parse(message) as CompleteMessage;
      callback(parsed);
    } catch (error) {
      console.error("Error parsing complete message:", error);
    }
  });
}

// Add job to Redis list (alternative to pub/sub for reliable queue)
export async function pushJobToQueue(job: JobMessage): Promise<void> {
  const publisher = getPublisher();
  await publisher.lPush(CHANNELS.JOB_QUEUE, JSON.stringify(job));
  console.log(`📤 Pushed job ${job.job_id} to queue list`);
}

// Graceful shutdown
export async function closeRedis(): Promise<void> {
  if (publisherClient) {
    await publisherClient.quit();
  }
  if (subscriberClient) {
    await subscriberClient.quit();
  }
  console.log("Redis connections closed");
}
