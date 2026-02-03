import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Environment variables - configure in .env
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

// Client for public operations (respects RLS)
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

// Admin client for backend operations (bypasses RLS)
export const supabaseAdmin: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY
);

// Database types
export interface Job {
  id: string;
  repo_url: string;
  status: "pending" | "processing" | "completed" | "failed";
  selected_model: string;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface Repo {
  id: string;
  job_id: string;
  name: string;
  structure_json: Record<string, unknown>;
  created_at: string;
}

export interface CodeEmbedding {
  id: string;
  repo_id: string;
  file_path: string;
  chunk: string;
  chunk_index: number;
  embedding: number[];
  metadata: Record<string, unknown>;
  created_at: string;
}

// Documentation file metadata stored in JSONB
export interface DocumentationFile {
  path: string;
  storage_path: string;
  size: number;
  content_type: string;
}

export interface AnalysisResult {
  id: string;
  job_id: string;
  documentation: string;
  documentation_files: DocumentationFile[];
  storage_path: string | null;
  patterns: string[];
  architecture_type: string;
  confidence_score: number;
  agent_reasoning: Record<string, unknown>[];
  dependencies_graph: Record<string, unknown>;
  suggested_improvements: Record<string, unknown>[];
  created_at: string;
}

// Helper functions
export async function createJob(
  repoUrl: string,
  selectedModel: string
): Promise<Job | null> {
  const { data, error } = await supabaseAdmin
    .from("jobs")
    .insert({
      repo_url: repoUrl,
      status: "pending",
      selected_model: selectedModel,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating job:", error);
    return null;
  }

  return data;
}

export async function updateJobStatus(
  jobId: string,
  status: Job["status"],
  result?: Record<string, unknown>,
  errorMessage?: string
): Promise<boolean> {
  const updateData: Partial<Job> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (result) updateData.result = result;
  if (errorMessage) updateData.error_message = errorMessage;

  const { error } = await supabaseAdmin
    .from("jobs")
    .update(updateData)
    .eq("id", jobId);

  if (error) {
    console.error("Error updating job:", error);
    return false;
  }

  return true;
}

export async function getJob(jobId: string): Promise<Job | null> {
  const { data, error } = await supabaseAdmin
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (error) {
    console.error("Error fetching job:", error);
    return null;
  }

  return data;
}

export async function getJobWithAnalysis(jobId: string): Promise<{
  job: Job;
  analysis: AnalysisResult | null;
} | null> {
  const { data: job, error: jobError } = await supabaseAdmin
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    console.error("Error fetching job:", jobError);
    return null;
  }

  const { data: analysis } = await supabaseAdmin
    .from("analysis_results")
    .select("*")
    .eq("job_id", jobId)
    .single();

  return { job, analysis };
}

export async function listJobs(limit = 50): Promise<Job[]> {
  const { data, error } = await supabaseAdmin
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error listing jobs:", error);
    return [];
  }

  return data || [];
}

// Semantic search using pgvector
export async function searchCodeEmbeddings(
  repoId: string,
  queryEmbedding: number[],
  limit = 10
): Promise<CodeEmbedding[]> {
  const { data, error } = await supabaseAdmin.rpc("search_code_embeddings", {
    query_embedding: queryEmbedding,
    match_repo_id: repoId,
    match_count: limit,
  });

  if (error) {
    console.error("Error searching embeddings:", error);
    return [];
  }

  return data || [];
}

// =============================================
// Storage Functions for Documentation Files
// =============================================

const DOCUMENTATION_BUCKET = "documentation";

/**
 * Get public URL for a documentation file
 */
export function getDocumentationPublicUrl(storagePath: string): string {
  const { data } = supabaseAdmin.storage
    .from(DOCUMENTATION_BUCKET)
    .getPublicUrl(storagePath);
  
  return data.publicUrl;
}

/**
 * Get signed URL for a documentation file (with expiration)
 */
export async function getDocumentationSignedUrl(
  storagePath: string,
  expiresIn = 3600 // 1 hour default
): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(DOCUMENTATION_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  
  if (error) {
    console.error("Error creating signed URL:", error);
    return null;
  }
  
  return data.signedUrl;
}

/**
 * Download documentation file content
 */
export async function getDocumentationFileContent(
  storagePath: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(DOCUMENTATION_BUCKET)
    .download(storagePath);
  
  if (error) {
    console.error("Error downloading file:", error);
    return null;
  }
  
  return await data.text();
}

/**
 * List all documentation files for a job
 */
export async function listDocumentationFiles(
  jobId: string
): Promise<{ name: string; size: number }[]> {
  const { data, error } = await supabaseAdmin.storage
    .from(DOCUMENTATION_BUCKET)
    .list(jobId, {
      sortBy: { column: "name", order: "asc" },
    });
  
  if (error) {
    console.error("Error listing files:", error);
    return [];
  }
  
  // Flatten nested folders
  const files: { name: string; size: number }[] = [];
  
  const listRecursive = async (prefix: string) => {
    const { data: items } = await supabaseAdmin.storage
      .from(DOCUMENTATION_BUCKET)
      .list(prefix);
    
    if (items) {
      for (const item of items) {
        const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id) {
          // It's a file
          files.push({ name: fullPath, size: item.metadata?.size || 0 });
        } else {
          // It's a folder, recurse
          await listRecursive(fullPath);
        }
      }
    }
  };
  
  await listRecursive(jobId);
  return files;
}

/**
 * Get analysis with documentation file URLs
 */
export async function getJobDocumentation(jobId: string): Promise<{
  analysis: AnalysisResult | null;
  files: Array<{
    path: string;
    url: string;
    size: number;
  }>;
} | null> {
  // Get analysis result
  const { data: analysis, error } = await supabaseAdmin
    .from("analysis_results")
    .select("*")
    .eq("job_id", jobId)
    .single();
  
  if (error || !analysis) {
    return null;
  }
  
  // Build file list with URLs
  const files = (analysis.documentation_files || []).map((file: DocumentationFile) => ({
    path: file.path,
    url: getDocumentationPublicUrl(file.storage_path),
    size: file.size,
  }));
  
  return { analysis, files };
}
