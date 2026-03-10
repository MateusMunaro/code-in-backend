-- Migration: User isolation via RLS
-- Adds user_id to jobs and replaces permissive RLS policies with real ones.
-- The service_role (used by the agent via supabaseAdmin) bypasses RLS by default,
-- but we also add explicit service_role policies as defense-in-depth.

-- =============================================
-- 1. Add user_id column to jobs
-- =============================================

-- Nullable initially so existing rows are preserved
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Performance index for filtering by user
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);

-- =============================================
-- 2. Drop old permissive policies
-- =============================================

DROP POLICY IF EXISTS "Allow all operations on jobs" ON jobs;
DROP POLICY IF EXISTS "Allow all operations on repos" ON repos;
DROP POLICY IF EXISTS "Allow all operations on code_embeddings" ON code_embeddings;
DROP POLICY IF EXISTS "Allow all operations on analysis_results" ON analysis_results;

-- =============================================
-- 3. Jobs — user & service_role policies
-- =============================================

-- Authenticated users can only see their own jobs
CREATE POLICY "Users can select own jobs"
  ON jobs FOR SELECT
  USING (
    user_id = auth.uid()
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users can insert own jobs"
  ON jobs FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users can update own jobs"
  ON jobs FOR UPDATE
  USING (
    user_id = auth.uid()
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users can delete own jobs"
  ON jobs FOR DELETE
  USING (
    user_id = auth.uid()
    OR auth.role() = 'service_role'
  );

-- =============================================
-- 4. Repos — cascade via jobs.user_id
-- =============================================

CREATE POLICY "Users can select own repos"
  ON repos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = repos.job_id
        AND jobs.user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users can insert own repos"
  ON repos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = repos.job_id
        AND jobs.user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users can update own repos"
  ON repos FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = repos.job_id
        AND jobs.user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users can delete own repos"
  ON repos FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = repos.job_id
        AND jobs.user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

-- =============================================
-- 5. Analysis results — cascade via jobs.user_id
-- =============================================

CREATE POLICY "Users can select own analysis_results"
  ON analysis_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = analysis_results.job_id
        AND jobs.user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users can insert own analysis_results"
  ON analysis_results FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = analysis_results.job_id
        AND jobs.user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users can update own analysis_results"
  ON analysis_results FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = analysis_results.job_id
        AND jobs.user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users can delete own analysis_results"
  ON analysis_results FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = analysis_results.job_id
        AND jobs.user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

-- =============================================
-- 6. Code embeddings — cascade via repos → jobs.user_id
-- =============================================

CREATE POLICY "Users can select own code_embeddings"
  ON code_embeddings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM repos
      JOIN jobs ON jobs.id = repos.job_id
      WHERE repos.id = code_embeddings.repo_id
        AND jobs.user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users can insert own code_embeddings"
  ON code_embeddings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM repos
      JOIN jobs ON jobs.id = repos.job_id
      WHERE repos.id = code_embeddings.repo_id
        AND jobs.user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users can update own code_embeddings"
  ON code_embeddings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM repos
      JOIN jobs ON jobs.id = repos.job_id
      WHERE repos.id = code_embeddings.repo_id
        AND jobs.user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Users can delete own code_embeddings"
  ON code_embeddings FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM repos
      JOIN jobs ON jobs.id = repos.job_id
      WHERE repos.id = code_embeddings.repo_id
        AND jobs.user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );
