-- Sprint 2 (REQ-JOB-003/004, REQ-CNS-003, REQ-MSG-010): notifications event columns, jobs school backfill

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS event_code VARCHAR(80);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NOT NULL DEFAULT 'in_app';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS payload JSONB;

CREATE INDEX IF NOT EXISTS idx_notifications_event
  ON notifications (user_id, event_code, created_at DESC);

-- Backfill jobs.school_id from the posting company's school when possible
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'school_id'
  ) THEN
    UPDATE jobs j
    SET school_id = u.school_id
    FROM users u
    WHERE j.company_id = u.id
      AND j.school_id IS NULL
      AND u.school_id IS NOT NULL;
  END IF;
END $$;
