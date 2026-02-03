-- Migration: Add GitHub PR support
-- Adds fields for GitHub token and Pull Request tracking

-- Add github_token to jobs table (encrypted storage recommended)
-- Note: In production, use Supabase Vault or similar for token encryption
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS github_token TEXT;

-- Add PR-related fields to analysis_results
ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS pr_url TEXT;
ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS pr_number INTEGER;
ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS pr_branch TEXT;
ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS pr_status TEXT DEFAULT 'none' 
  CHECK (pr_status IN ('none', 'created', 'merged', 'closed', 'failed'));
ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS pr_created_at TIMESTAMP WITH TIME ZONE;

-- Index for PR status filtering
CREATE INDEX IF NOT EXISTS idx_analysis_results_pr_status ON analysis_results(pr_status);

-- Comment explaining token security
COMMENT ON COLUMN jobs.github_token IS 'GitHub OAuth token for repository write access. Should be encrypted in production.';
