import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { initRedis, closeRedis } from "./lib/redis";
import { websocketPlugin, initWebSocketRedisRelay, getConnectionStats } from "./lib/websocket";
import { reposRoutes } from "./routes/repos";
import { jobsRoutes } from "./routes/jobs";
import { modelsRoutes } from "./routes/models";

// Initialize services
async function initializeServices() {
  try {
    // Initialize Redis
    await initRedis();
    console.log("✅ Redis initialized");

    // Initialize WebSocket Redis relay
    await initWebSocketRedisRelay();
    console.log("✅ WebSocket relay initialized");
  } catch (error) {
    console.error("❌ Failed to initialize services:", error);
    console.log("⚠️ Running in degraded mode without Redis");
  }
}

// Create the app
const app = new Elysia()
  .use(cors())
  // WebSocket for real-time updates
  .use(websocketPlugin)
  // API Routes
  .use(reposRoutes)
  .use(jobsRoutes)
  .use(modelsRoutes)
  // Health check endpoints
  .get("/", () => ({
    name: "Code Indexer AI Agent API",
    version: "1.0.0",
    description: "AI-powered code analysis and documentation generator",
  }))
  .get("/health", () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
    connections: getConnectionStats(),
  }))
  .listen(process.env.PORT || 3333);

// Initialize services after server starts
initializeServices();

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down...");
  await closeRedis();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 Shutting down...");
  await closeRedis();
  process.exit(0);
});

console.log(
  `🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`
);
console.log(`📡 WebSocket available at ws://${app.server?.hostname}:${app.server?.port}/ws`);
