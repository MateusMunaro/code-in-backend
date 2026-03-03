import { Elysia, t } from "elysia";
import { createJob, getJob, updateJobStatus } from "../lib/supabase";
import { pushJobToQueue, CHANNELS } from "../lib/redis";
import { getDefaultModel } from "../lib/models";
import {
    McpPayloadSchema,
    setMcpJobPending,
    getMcpJobStatus,
    type McpJobMessage,
} from "../lib/mcp";

export const mcpRoutes = new Elysia({ prefix: "/api/mcp" })

    // ─────────────────────────────────────────────
    // POST /api/mcp/analyze
    // Receives JSON from the C CLI, validates with
    // Zod, creates a Supabase job, pushes to Redis.
    // ─────────────────────────────────────────────
    .post(
        "/analyze",
        async ({ body, set }) => {
            // 1. Strict Zod validation
            const parsed = McpPayloadSchema.safeParse(body);

            if (!parsed.success) {
                set.status = 400;
                return {
                    success: false,
                    error: "Invalid payload from CLI",
                    details: parsed.error.issues.map((issue) => ({
                        path: issue.path.join("."),
                        message: issue.message,
                    })),
                };
            }

            const payload = parsed.data;
            const payloadType = payload.metadata.type;

            // 2. Derive repo info from payload metadata
            const repoName =
                payloadType === "scan_result"
                    ? (payload.metadata as { project_name?: string }).project_name || "local-project"
                    : "local-project";
            const repoUrl = `local://${repoName}`;

            // 3. Create job in Supabase
            const defaultModel = getDefaultModel();
            const job = await createJob(repoUrl, defaultModel.id);

            if (!job) {
                set.status = 500;
                return {
                    success: false,
                    error: "Failed to create job in database",
                };
            }

            // 4. Update status to processing
            await updateJobStatus(job.id, "processing");

            // 5. Push to Redis queue with MCP-specific message
            try {
                const mcpJob: McpJobMessage = {
                    job_id: job.id,
                    source: "local_cli",
                    payload_type: payloadType,
                    payload: payload,
                    timestamp: new Date().toISOString(),
                };

                const { getPublisher } = await import("../lib/redis");
                const publisher = getPublisher();
                await publisher.lPush(
                    CHANNELS.MCP_JOBS,
                    JSON.stringify(mcpJob)
                );
                console.log(`📤 MCP job ${job.id} pushed to queue (${payloadType})`);
            } catch (error) {
                console.error("Failed to push MCP job to Redis:", error);
                await updateJobStatus(job.id, "failed", undefined, "Failed to queue MCP job");
                set.status = 500;
                return {
                    success: false,
                    error: "Failed to queue job for processing",
                };
            }

            // 6. Mark as PENDING in Redis for polling
            try {
                await setMcpJobPending(job.id);
            } catch (error) {
                console.error("Failed to set MCP job status in Redis:", error);
                // Non-fatal: the job is already queued, polling will fallback to Supabase
            }

            return {
                success: true,
                data: {
                    job_id: job.id,
                    payload_type: payloadType,
                    status: "processing",
                    message: "Analysis job queued successfully",
                },
            };
        },
        {
            // Accept any JSON body — Zod does the real validation
            body: t.Any(),
        }
    )

    // ─────────────────────────────────────────────
    // GET /api/mcp/status/:jobId
    // Poll for job completion. Checks Redis first,
    // falls back to Supabase.
    // ─────────────────────────────────────────────
    .get(
        "/status/:jobId",
        async ({ params, set }) => {
            const { jobId } = params;

            // 1. Try Redis first (fast path)
            try {
                const mcpStatus = await getMcpJobStatus(jobId);
                if (mcpStatus) {
                    return {
                        success: true,
                        data: mcpStatus,
                    };
                }
            } catch (error) {
                console.error("Redis lookup failed, falling back to Supabase:", error);
            }

            // 2. Fallback to Supabase
            const job = await getJob(jobId);

            if (!job) {
                set.status = 404;
                return {
                    success: false,
                    error: "Job not found",
                };
            }

            // Map Supabase status to MCP polling response
            const statusMap: Record<string, "PENDING" | "COMPLETED" | "FAILED"> = {
                pending: "PENDING",
                processing: "PENDING",
                completed: "COMPLETED",
                failed: "FAILED",
            };

            return {
                success: true,
                data: {
                    status: statusMap[job.status] || "PENDING",
                    ...(job.status === "completed" && job.result
                        ? { result: JSON.stringify(job.result) }
                        : {}),
                    ...(job.status === "failed" && job.error_message
                        ? { error: job.error_message }
                        : {}),
                },
            };
        },
        {
            params: t.Object({
                jobId: t.String(),
            }),
        }
    );
