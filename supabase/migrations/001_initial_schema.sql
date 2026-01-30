-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Jobs table: tracks analysis requests
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  selected_model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Repos table: stores repository structure
CREATE TABLE IF NOT EXISTS repos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  structure_json JSONB NOT NULL DEFAULT '{}',
  file_count INTEGER DEFAULT 0,
  total_lines INTEGER DEFAULT 0,
  languages JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Code embeddings table: stores vector embeddings for semantic search
CREATE TABLE IF NOT EXISTS code_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  chunk TEXT NOT NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  embedding vector(1536), -- OpenAI ada-002 dimension, adjust for other models
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Analysis results table: stores the generated documentation
CREATE TABLE IF NOT EXISTS analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  documentation TEXT NOT NULL,
  patterns TEXT[] DEFAULT '{}',
  architecture_type TEXT,
  confidence_score FLOAT DEFAULT 0.0,
  agent_reasoning JSONB DEFAULT '[]', -- Stores the LangGraph agent's reasoning steps
  dependencies_graph JSONB DEFAULT '{}', -- Graph of code dependencies
  suggested_improvements JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_repos_job_id ON repos(job_id);
CREATE INDEX IF NOT EXISTS idx_code_embeddings_repo_id ON code_embeddings(repo_id);
CREATE INDEX IF NOT EXISTS idx_code_embeddings_file_path ON code_embeddings(file_path);
CREATE INDEX IF NOT EXISTS idx_analysis_results_job_id ON analysis_results(job_id);

-- Vector similarity search index (using HNSW for better performance)
CREATE INDEX IF NOT EXISTS idx_code_embeddings_vector ON code_embeddings 
  USING hnsw (embedding vector_cosine_ops);

-- Function for semantic search
CREATE OR REPLACE FUNCTION search_code_embeddings(
  query_embedding vector(1536),
  match_repo_id UUID,
  match_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  repo_id UUID,
  file_path TEXT,
  chunk TEXT,
  chunk_index INTEGER,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.id,
    ce.repo_id,
    ce.file_path,
    ce.chunk,
    ce.chunk_index,
    ce.metadata,
    1 - (ce.embedding <=> query_embedding) AS similarity
  FROM code_embeddings ce
  WHERE ce.repo_id = match_repo_id
  ORDER BY ce.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for jobs updated_at
CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
-- Enable RLS
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE repos ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;

-- For now, allow all operations (adjust when adding auth)
CREATE POLICY "Allow all operations on jobs" ON jobs FOR ALL USING (true);
CREATE POLICY "Allow all operations on repos" ON repos FOR ALL USING (true);
CREATE POLICY "Allow all operations on code_embeddings" ON code_embeddings FOR ALL USING (true);
CREATE POLICY "Allow all operations on analysis_results" ON analysis_results FOR ALL USING (true);
