-- Migration: Add Supabase Storage bucket for documentation files
-- and update analysis_results table to store file metadata

-- =============================================
-- 1. Create Storage bucket for documentation
-- =============================================

-- Insert bucket configuration (Supabase Storage uses storage schema)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documentation',
  'documentation',
  true,  -- Public bucket for easy access
  5242880,  -- 5MB limit per file
  ARRAY['text/markdown', 'text/plain', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- 2. Storage policies for the documentation bucket
-- =============================================

-- Policy: Allow public read access to all documentation files
CREATE POLICY "Public read access for documentation"
ON storage.objects FOR SELECT
USING (bucket_id = 'documentation');

-- Policy: Allow service role to insert files
CREATE POLICY "Service role can upload documentation"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'documentation' 
  AND auth.role() = 'service_role'
);

-- Policy: Allow service role to update files
CREATE POLICY "Service role can update documentation"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'documentation' 
  AND auth.role() = 'service_role'
);

-- Policy: Allow service role to delete files
CREATE POLICY "Service role can delete documentation"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'documentation' 
  AND auth.role() = 'service_role'
);

-- =============================================
-- 3. Update analysis_results table
-- =============================================

-- Add column to store documentation file metadata
-- Structure: [{ path: string, size: number, content_type: string }]
ALTER TABLE analysis_results 
ADD COLUMN IF NOT EXISTS documentation_files JSONB DEFAULT '[]';

-- Add storage_path column to store the base path in storage
-- Format: 'documentation/{job_id}/'
ALTER TABLE analysis_results 
ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- =============================================
-- 4. Function to delete storage files when job is deleted
-- =============================================

-- This function will be called by a trigger to clean up storage
CREATE OR REPLACE FUNCTION delete_documentation_files()
RETURNS TRIGGER AS $$
DECLARE
  file_record JSONB;
  storage_base_path TEXT;
BEGIN
  -- Get the storage path from the analysis result
  SELECT storage_path INTO storage_base_path
  FROM analysis_results
  WHERE job_id = OLD.id;
  
  -- If there's a storage path, delete all files in that path
  IF storage_base_path IS NOT NULL THEN
    DELETE FROM storage.objects
    WHERE bucket_id = 'documentation'
    AND name LIKE storage_base_path || '%';
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to clean up files when a job is deleted
DROP TRIGGER IF EXISTS trigger_delete_documentation_files ON jobs;
CREATE TRIGGER trigger_delete_documentation_files
  BEFORE DELETE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION delete_documentation_files();

-- =============================================
-- 5. Index for faster queries
-- =============================================

CREATE INDEX IF NOT EXISTS idx_analysis_results_storage_path 
ON analysis_results(storage_path);

-- =============================================
-- 6. Comment for documentation
-- =============================================

COMMENT ON COLUMN analysis_results.documentation_files IS 
'Array of documentation file metadata: [{path, size, content_type}]';

COMMENT ON COLUMN analysis_results.storage_path IS 
'Base path in Supabase Storage bucket: documentation/{job_id}/';
