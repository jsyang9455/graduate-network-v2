-- Sprint 5: community scrap / report / blind / categories (REQ-COM-001/003/004/005)
-- Idempotent. Safe on Sprint 4 databases.

CREATE TABLE IF NOT EXISTS post_categories (
    code       VARCHAR(50) PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO post_categories (code, name, sort_order) VALUES
    ('employment_review', '취업후기', 1),
    ('interview_review', '면접후기', 2),
    ('job_qa', '직무 Q&A', 3),
    ('mentoring', '멘토링', 4),
    ('news', '소식', 90)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS post_scraps (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_post_scraps_post ON post_scraps(post_id);

CREATE TABLE IF NOT EXISTS post_reports (
    id          SERIAL PRIMARY KEY,
    post_id     INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason      TEXT NOT NULL,
    status      VARCHAR(20) NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (post_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_post_reports_status ON post_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_reports_post ON post_reports(post_id);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'posts') THEN
        ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE posts ADD COLUMN IF NOT EXISTS blinded_at TIMESTAMP;
        ALTER TABLE posts ADD COLUMN IF NOT EXISTS blinded_by INTEGER REFERENCES users(id);
        ALTER TABLE posts ADD COLUMN IF NOT EXISTS blind_reason TEXT;
        ALTER TABLE posts ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
        ALTER TABLE posts ADD COLUMN IF NOT EXISTS file_ids INTEGER[] DEFAULT '{}';
        CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);
        CREATE INDEX IF NOT EXISTS idx_posts_likes ON posts(likes_count DESC, created_at DESC);
    END IF;
END $$;
