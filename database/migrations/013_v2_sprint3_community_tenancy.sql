-- Sprint 3: community / announcements / certificates school tenancy (REQ-IAM-009)
-- All DML is IF EXISTS-guarded: incomplete initdb (pre-fix schema abort) must not crash migrate.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'announcements') THEN
        ALTER TABLE announcements ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id);
        CREATE INDEX IF NOT EXISTS idx_announcements_school ON announcements(school_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'certificates') THEN
        ALTER TABLE certificates ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id);
        CREATE INDEX IF NOT EXISTS idx_certificates_school ON certificates(school_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'education_programs') THEN
        ALTER TABLE education_programs ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id);
        CREATE INDEX IF NOT EXISTS idx_education_programs_school ON education_programs(school_id);
    END IF;
END $$;

-- backfill posts.school_id from author
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'posts'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'posts' AND column_name = 'school_id'
    ) THEN
        UPDATE posts p
        SET school_id = u.school_id
        FROM users u
        WHERE p.user_id = u.id
          AND p.school_id IS NULL
          AND u.school_id IS NOT NULL;
    END IF;
END $$;

-- backfill announcements / certificates / education_programs → default tenant
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'announcements'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'announcements' AND column_name = 'school_id'
    ) THEN
        UPDATE announcements a
        SET school_id = s.id
        FROM schools s
        WHERE s.name = '전주공업고등학교'
          AND a.school_id IS NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'certificates'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'certificates' AND column_name = 'school_id'
    ) THEN
        UPDATE certificates c
        SET school_id = u.school_id
        FROM users u
        WHERE c.user_id = u.id
          AND c.school_id IS NULL
          AND u.school_id IS NOT NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'education_programs'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'education_programs' AND column_name = 'school_id'
    ) THEN
        UPDATE education_programs ep
        SET school_id = u.school_id
        FROM users u
        WHERE ep.created_by = u.id
          AND ep.school_id IS NULL
          AND u.school_id IS NOT NULL;

        UPDATE education_programs ep
        SET school_id = s.id
        FROM schools s
        WHERE s.name = '전주공업고등학교'
          AND ep.school_id IS NULL;
    END IF;
END $$;
