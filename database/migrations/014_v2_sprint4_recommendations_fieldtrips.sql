-- Sprint 4: explainable recommendations + field_trips (REQ-REC-001/003/004/005, REQ-TRP-001~003)
-- Idempotent. Safe on Sprint 3 databases.

-- ── recommendation keywords & scores ─────────────────────────
CREATE TABLE IF NOT EXISTS resume_keywords (
    id         SERIAL PRIMARY KEY,
    resume_id  INTEGER NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    token      VARCHAR(100) NOT NULL,
    weight     REAL NOT NULL DEFAULT 1.0,
    UNIQUE (resume_id, token)
);

CREATE INDEX IF NOT EXISTS idx_resume_keywords_resume ON resume_keywords(resume_id);

CREATE TABLE IF NOT EXISTS job_keywords (
    id      SERIAL PRIMARY KEY,
    job_id  INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    token   VARCHAR(100) NOT NULL,
    weight  REAL NOT NULL DEFAULT 1.0,
    UNIQUE (job_id, token)
);

CREATE INDEX IF NOT EXISTS idx_job_keywords_job ON job_keywords(job_id);

CREATE TABLE IF NOT EXISTS job_recommendations (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id       INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    school_id    INTEGER REFERENCES schools(id),
    score        REAL NOT NULL DEFAULT 0,
    reasons      JSONB NOT NULL DEFAULT '[]'::jsonb,
    computed_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_recommendations_user_score
    ON job_recommendations(user_id, score DESC, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_recommendations_school
    ON job_recommendations(school_id, user_id);

CREATE TABLE IF NOT EXISTS recommendation_feedback (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    event      VARCHAR(20) NOT NULL
                 CHECK (event IN ('impression', 'click', 'apply')),
    school_id  INTEGER REFERENCES schools(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recommendation_feedback_user
    ON recommendation_feedback(user_id, created_at DESC);

-- ── field trips (견학) — migrate from announcements industry-visit ──
CREATE TABLE IF NOT EXISTS field_trips (
    id                     SERIAL PRIMARY KEY,
    school_id              INTEGER NOT NULL REFERENCES schools(id),
    company_name           VARCHAR(200) NOT NULL,
    title                  VARCHAR(200) NOT NULL,
    description            TEXT,
    place                  VARCHAR(200),
    event_date             DATE,
    event_time             VARCHAR(50),
    capacity               INTEGER NOT NULL DEFAULT 0,
    current_applicants     INTEGER NOT NULL DEFAULT 0,
    deadline               DATE,
    mode                   VARCHAR(20) NOT NULL DEFAULT 'fifo'
                             CHECK (mode IN ('fifo', 'approval')),
    fee                    VARCHAR(200),
    benefits               TEXT[],
    requirements           TEXT[],
    contact_phone          VARCHAR(30),
    contact_email          VARCHAR(100),
    tags                   TEXT[],
    image_url              VARCHAR(500),
    is_active              BOOLEAN NOT NULL DEFAULT true,
    source_announcement_id INTEGER,
    created_by             INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_field_trips_school ON field_trips(school_id, event_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_field_trips_source_announcement
    ON field_trips(source_announcement_id)
    WHERE source_announcement_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS field_trip_applications (
    id               SERIAL PRIMARY KEY,
    trip_id          INTEGER NOT NULL REFERENCES field_trips(id) ON DELETE CASCADE,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    school_id        INTEGER REFERENCES schools(id),
    applicant_name   VARCHAR(100) NOT NULL,
    applicant_phone  VARCHAR(30) NOT NULL,
    applicant_email  VARCHAR(100),
    message          TEXT,
    status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    attendance       VARCHAR(20)
                       CHECK (attendance IS NULL OR attendance IN ('present', 'absent', 'excused')),
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (trip_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_field_trip_applications_trip
    ON field_trip_applications(trip_id, status);
CREATE INDEX IF NOT EXISTS idx_field_trip_applications_user
    ON field_trip_applications(user_id, created_at DESC);

-- Migrate industry-visit announcements → field_trips (once per source id)
INSERT INTO field_trips (
    school_id, company_name, title, description, place, event_date, event_time,
    capacity, current_applicants, deadline, mode, fee, benefits, requirements,
    contact_phone, contact_email, tags, image_url, is_active, source_announcement_id
)
SELECT
    COALESCE(a.school_id, s.id),
    COALESCE(NULLIF(TRIM(a.organizer), ''), a.title),
    a.title,
    a.description,
    a.location,
    a.event_date,
    a.event_time,
    COALESCE(a.capacity, 0),
    COALESCE(a.current_applicants, 0),
    a.deadline,
    'fifo',
    a.fee,
    a.benefits,
    a.requirements,
    a.contact_phone,
    a.contact_email,
    a.tags,
    a.image_url,
    COALESCE(a.is_active, true),
    a.id
FROM announcements a
CROSS JOIN LATERAL (
    SELECT id FROM schools WHERE name = '전주공업고등학교' LIMIT 1
) s
WHERE a.type = 'industry-visit'
  AND NOT EXISTS (
      SELECT 1 FROM field_trips ft WHERE ft.source_announcement_id = a.id
  );

-- Migrate applications when announcement_applications exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'announcement_applications'
  ) THEN
    INSERT INTO field_trip_applications (
        trip_id, user_id, school_id, applicant_name, applicant_phone, applicant_email,
        message, status, created_at, updated_at
    )
    SELECT
        ft.id,
        aa.user_id,
        ft.school_id,
        aa.applicant_name,
        aa.applicant_phone,
        aa.applicant_email,
        aa.message,
        CASE
          WHEN aa.status IN ('approved', 'accepted', 'confirmed') THEN 'approved'
          WHEN aa.status IN ('rejected', 'denied') THEN 'rejected'
          WHEN aa.status IN ('cancelled', 'canceled') THEN 'cancelled'
          ELSE 'pending'
        END,
        COALESCE(aa.created_at, CURRENT_TIMESTAMP),
        COALESCE(aa.updated_at, CURRENT_TIMESTAMP)
    FROM announcement_applications aa
    JOIN field_trips ft ON ft.source_announcement_id = aa.announcement_id
    WHERE aa.user_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM field_trip_applications fta
          WHERE fta.trip_id = ft.id AND fta.user_id = aa.user_id
      );
  END IF;
END $$;
