-- Sprint 6: REC-002 associated recs, COM-002 tags/attachments, TRP-003 after-report
-- Idempotent. Safe on Sprint 5 databases.

-- Job scraps for association signal (REQ-REC-002) + student bookmark
CREATE TABLE IF NOT EXISTS job_scraps (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    school_id  INTEGER REFERENCES schools(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_scraps_job ON job_scraps(job_id);
CREATE INDEX IF NOT EXISTS idx_job_scraps_school ON job_scraps(school_id, user_id);

-- Field trip after-report (REQ-TRP-003)
CREATE TABLE IF NOT EXISTS field_trip_reports (
    id                 SERIAL PRIMARY KEY,
    trip_id            INTEGER NOT NULL REFERENCES field_trips(id) ON DELETE CASCADE,
    school_id          INTEGER NOT NULL REFERENCES schools(id),
    author_id          INTEGER NOT NULL REFERENCES users(id),
    summary            TEXT NOT NULL,
    outcome            TEXT,
    attendees_present  INTEGER NOT NULL DEFAULT 0,
    attendees_absent   INTEGER NOT NULL DEFAULT 0,
    notes              TEXT,
    file_ids           INTEGER[] DEFAULT '{}',
    created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (trip_id)
);

CREATE INDEX IF NOT EXISTS idx_field_trip_reports_school
    ON field_trip_reports(school_id, created_at DESC);

-- Ensure posts tags/file_ids exist (Sprint 5 may already have added them)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'posts') THEN
        ALTER TABLE posts ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
        ALTER TABLE posts ADD COLUMN IF NOT EXISTS file_ids INTEGER[] DEFAULT '{}';
        CREATE INDEX IF NOT EXISTS idx_posts_tags ON posts USING GIN (tags);
    END IF;
END $$;
