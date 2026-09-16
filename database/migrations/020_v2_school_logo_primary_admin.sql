-- School tenant branding (REQ-IAM-001/003, REQ-PLT-004)
-- logo_file_id + primary_admin_user_id; files.kind += school_logo
-- Idempotent.

-- Expand files.kind to allow school logos
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT c.conname INTO con_name
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  WHERE t.relname = 'files' AND c.contype = 'c' AND pg_get_constraintdef(c.oid) ILIKE '%kind%'
  LIMIT 1;

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE files DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE files DROP CONSTRAINT IF EXISTS files_kind_check;

ALTER TABLE files
  ADD CONSTRAINT files_kind_check
  CHECK (kind IN (
    'resume_pdf',
    'counseling_pdf',
    'counseling_docx',
    'attachment',
    'school_logo'
  ));

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS logo_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL;

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS primary_admin_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_schools_primary_admin ON schools(primary_admin_user_id);
CREATE INDEX IF NOT EXISTS idx_schools_logo_file ON schools(logo_file_id);
