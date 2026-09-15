-- REQ-JOB-007: company approval flag on company_profiles
-- Idempotent. Existing rows backfilled as approved; new inserts default pending.

ALTER TABLE company_profiles
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20);

ALTER TABLE company_profiles
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;

ALTER TABLE company_profiles
  ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE company_profiles
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Continuity: rows created before this migration are treated as already approved
UPDATE company_profiles
SET approval_status = 'approved',
    approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP)
WHERE approval_status IS NULL
   OR approval_status NOT IN ('pending', 'approved', 'rejected');

ALTER TABLE company_profiles
  ALTER COLUMN approval_status SET DEFAULT 'pending';

ALTER TABLE company_profiles
  ALTER COLUMN approval_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_profiles_approval_status_check'
  ) THEN
    ALTER TABLE company_profiles
      ADD CONSTRAINT company_profiles_approval_status_check
      CHECK (approval_status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_company_profiles_approval
  ON company_profiles (approval_status);
