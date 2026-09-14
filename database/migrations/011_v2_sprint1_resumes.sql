-- Sprint 1 (REQ-RSM-001~005, REQ-CNS-001/004/005, REQ-PLT-004, REQ-JOB-005):
-- files storage metadata, resumes, counseling documents, job_applications.resume_id
-- Idempotent. Safe on Wave 1 databases.

-- ── files (DB stores metadata only; bytes live in storage adapter) ──
CREATE TABLE IF NOT EXISTS files (
    id             SERIAL PRIMARY KEY,
    school_id      INTEGER REFERENCES schools(id),
    owner_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    bucket_key     TEXT NOT NULL,
    mime           VARCHAR(120) NOT NULL,
    size           INTEGER,
    kind           VARCHAR(40) NOT NULL
                     CHECK (kind IN ('resume_pdf', 'counseling_pdf', 'counseling_docx', 'attachment')),
    original_name  VARCHAR(255),
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_files_school ON files(school_id, id);
CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner_user_id);

-- ── resumes ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resumes (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    school_id      INTEGER NOT NULL REFERENCES schools(id),
    title          VARCHAR(200) NOT NULL DEFAULT '이력서',
    is_primary     BOOLEAN NOT NULL DEFAULT FALSE,
    status         VARCHAR(20) NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'published')),
    version        INTEGER NOT NULL DEFAULT 1,
    template_code  VARCHAR(50) NOT NULL DEFAULT 'basic',
    basic_info     JSONB NOT NULL DEFAULT '{}'::jsonb,
    summary        TEXT,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_resumes_user ON resumes(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_resumes_school ON resumes(school_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS resumes_one_primary_per_user
    ON resumes (user_id) WHERE is_primary = true;

CREATE TABLE IF NOT EXISTS resume_items (
    id         SERIAL PRIMARY KEY,
    resume_id  INTEGER NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    section    VARCHAR(40) NOT NULL
                 CHECK (section IN (
                   'experience', 'education', 'certificate', 'award',
                   'language', 'skill', 'portfolio', 'intro'
                 )),
    payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_resume_items_resume ON resume_items(resume_id, section, sort_order);

CREATE TABLE IF NOT EXISTS resume_documents (
    id             SERIAL PRIMARY KEY,
    resume_id      INTEGER NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    file_id        INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    template_code  VARCHAR(50),
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_resume_documents_resume ON resume_documents(resume_id, created_at DESC);

-- ── counseling: types, action, follow-up date, documents ─────
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'counseling_journals'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) ILIKE '%type%'
    LOOP
        EXECUTE format('ALTER TABLE counseling_journals DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;

ALTER TABLE counseling_journals
    ADD CONSTRAINT counseling_journals_type_check
    CHECK (type IN (
        '진로상담', '취업상담', '심리상담', '학습상담', '기타',
        '진학상담', '생활상담'
    ));

ALTER TABLE counseling_journals ADD COLUMN IF NOT EXISTS action_taken TEXT;
ALTER TABLE counseling_journals ADD COLUMN IF NOT EXISTS follow_up_at DATE;

CREATE TABLE IF NOT EXISTS counseling_documents (
    id          SERIAL PRIMARY KEY,
    journal_id  INTEGER NOT NULL REFERENCES counseling_journals(id) ON DELETE CASCADE,
    file_id     INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    format      VARCHAR(10) NOT NULL CHECK (format IN ('pdf', 'docx')),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_counseling_documents_journal
    ON counseling_documents(journal_id, created_at DESC);

-- ── job applications: attach generated resume ────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_applications') THEN
        ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS resume_id INTEGER REFERENCES resumes(id);
        CREATE INDEX IF NOT EXISTS idx_job_applications_resume ON job_applications(resume_id);
    END IF;
END $$;
