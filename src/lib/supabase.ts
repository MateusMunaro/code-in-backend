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

export interface AnalysisResult {
  id: string;
  job_id: string;
  documentation: string;
  patterns: string[];
  architecture_type: string;
  confidence_score: number;
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
