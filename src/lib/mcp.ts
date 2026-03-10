import { z } from "zod";
import { getPublisher } from "./redis";

// =============================================
// Zod Schemas — CLI "code-in" payload validation
// =============================================

// --- Shared ---
const MetadataBase = z.object({
  version: z.string(),
  timestamp: z.string(),
});

// --- Scan Result ---
const ScanFileSchema = z.object({
  path: z.string(),
  extension: z.string().optional(),
  category: z.string().optional(),
  size: z.number().optional(),
  lines: z.number().optional(),
  hash: z.string().optional(),
  modified_at: z.string().optional(),
  content: z.string().optional(),
});

const ScanStatisticsSchema = z.object({
  total_files: z.number(),
  total_lines: z.number(),
  total_size: z.number(),
  by_category: z.record(z.string(), z.number()).optional(),
});

const ScanResultSchema = z.object({
  metadata: MetadataBase.extend({
    type: z.literal("scan_result"),
    project_name: z.string().optional(),
    root_path: z.string().optional(),
  }),
  statistics: ScanStatisticsSchema,
  files: z.array(ScanFileSchema),
});

// --- Diff Result ---
const ChangeStatsSchema = z.object({
  lines_added: z.number(),
  lines_removed: z.number(),
});

const ChangeEntrySchema = z.object({
  path: z.string(),
  type: z.enum(["created", "modified", "deleted"]),
  changed_at: z.string().optional(),
  stats: ChangeStatsSchema.optional(),
  content: z.string().optional(),
});

const DiffStatisticsSchema = z.object({
  files_created: z.number(),
  files_modified: z.number(),
  files_deleted: z.number(),
  lines_added: z.number(),
  lines_removed: z.number(),
});

const DiffResultSchema = z.object({
  metadata: MetadataBase.extend({
    type: z.literal("diff_result"),
    baseline_time: z.string().optional(),
    current_time: z.string().optional(),
  }),
  statistics: DiffStatisticsSchema,
  changes: z.array(ChangeEntrySchema),
});

// --- Union: the endpoint accepts either scan or diff ---
export const McpPayloadSchema = z.union([ScanResultSchema, DiffResultSchema]);

export type McpPayload = z.infer<typeof McpPayloadSchema>;
export type ScanResult = z.infer<typeof ScanResultSchema>;
export type DiffResult = z.infer<typeof DiffResultSchema>;

// =============================================
// MCP Job message (what gets pushed to Redis)
// =============================================
export interface McpJobMessage {
  job_id: string;
  source: "local_cli";
  payload_type: "scan_result" | "diff_result";
  payload: McpPayload;
  timestamp: string;
}

// =============================================
// Redis helpers — MCP result key/value store
// =============================================

const MCP_RESULT_PREFIX = "mcp:result:";
const MCP_RESULT_TTL = 3600; // 1 hour

export interface McpJobStatus {
  status: "PENDING" | "COMPLETED" | "FAILED";
  result?: unknown;
  error?: string;
}

/** Mark a job as PENDING in Redis */
export async function setMcpJobPending(jobId: string): Promise<void> {
  const publisher = getPublisher();
  const value: McpJobStatus = { status: "PENDING" };
  await publisher.set(
    `${MCP_RESULT_PREFIX}${jobId}`,
    JSON.stringify(value),
    { EX: MCP_RESULT_TTL }
  );
}

/** Store the completed result for a job */
export async function setMcpJobResult(jobId: string, result: unknown): Promise<void> {
  const publisher = getPublisher();
  const value: McpJobStatus = { status: "COMPLETED", result };
  await publisher.set(
    `${MCP_RESULT_PREFIX}${jobId}`,
    JSON.stringify(value),
    { EX: MCP_RESULT_TTL }
  );
}

/** Store a failure for a job */
export async function setMcpJobFailed(jobId: string, error: string): Promise<void> {
  const publisher = getPublisher();
  const value: McpJobStatus = { status: "FAILED", error };
  await publisher.set(
    `${MCP_RESULT_PREFIX}${jobId}`,
    JSON.stringify(value),
    { EX: MCP_RESULT_TTL }
  );
}

/** Get current status of an MCP job from Redis */
export async function getMcpJobStatus(jobId: string): Promise<McpJobStatus | null> {
  const publisher = getPublisher();
  const raw = await publisher.get(`${MCP_RESULT_PREFIX}${jobId}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as McpJobStatus;
  } catch {
    return null;
  }
}
