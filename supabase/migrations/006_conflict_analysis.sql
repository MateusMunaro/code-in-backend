-- Migration: Add support for conflict analysis jobs
-- Adds job_type column to jobs table and conflict_analysis JSONB to analysis_results

-- Add job_type to jobs (default 'analysis' for backward compatibility)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_type TEXT NOT NULL DEFAULT 'analysis'
  CHECK (job_type IN ('analysis', 'conflict_analysis'));

-- Add branches array to jobs (stores which branches were analyzed)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS branches TEXT[];

-- Add conflict_analysis JSONB to analysis_results
ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS conflict_analysis JSONB;

-- Index for filtering by job_type
CREATE INDEX IF NOT EXISTS idx_jobs_job_type ON jobs(job_type);

-- Comment for documentation
COMMENT ON COLUMN jobs.job_type IS 'Type of job: analysis (standard code analysis) or conflict_analysis (multi-branch conflict detection)';
COMMENT ON COLUMN jobs.branches IS 'List of branch names analyzed (only for conflict_analysis jobs)';
COMMENT ON COLUMN analysis_results.conflict_analysis IS 'Structured conflict analysis result with risks, recommendations, and merge order';
