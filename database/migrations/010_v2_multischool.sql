-- Wave 1 (REQ-IAM-001~010, REQ-PLT-002/003): schools, RBAC, audit, users.school_id
-- Idempotent. Safe on existing v1 databases.

-- ── schools ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schools (
    id         SERIAL PRIMARY KEY,
    code       VARCHAR(32) UNIQUE,
    name       VARCHAR(200) NOT NULL,
    region     VARCHAR(100),
    biz_no     VARCHAR(20),
    status     VARCHAR(20) NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS schools_name_active_unique
    ON schools (name) WHERE status = 'active';

-- ── departments ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
    id         SERIAL PRIMARY KEY,
    school_id  INTEGER NOT NULL REFERENCES schools(id),
    name       VARCHAR(100) NOT NULL,
    is_active  BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS departments_school_name_unique
    ON departments (school_id, name) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_departments_school ON departments(school_id);

-- ── roles / menus / permissions ──────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
    id         SERIAL PRIMARY KEY,
    code       VARCHAR(50) UNIQUE NOT NULL,
    name       VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS menus (
    id         SERIAL PRIMARY KEY,
    code       VARCHAR(50) UNIQUE NOT NULL,
    name       VARCHAR(100) NOT NULL,
    parent_id  INTEGER REFERENCES menus(id),
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS role_menu_permissions (
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    menu_id INTEGER NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    actions TEXT[] NOT NULL DEFAULT '{}',
    PRIMARY KEY (role_id, menu_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id    INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    school_id  INTEGER REFERENCES schools(id),
    granted_by INTEGER REFERENCES users(id),
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_unique
    ON user_roles (user_id, role_id, COALESCE(school_id, 0));

CREATE TABLE IF NOT EXISTS school_transfers (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id),
    from_school_id  INTEGER REFERENCES schools(id),
    to_school_id    INTEGER NOT NULL REFERENCES schools(id),
    transferred_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reason          TEXT,
    actor_id        INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id          SERIAL PRIMARY KEY,
    actor_id    INTEGER REFERENCES users(id),
    school_id   INTEGER REFERENCES schools(id),
    action      VARCHAR(100) NOT NULL,
    resource    VARCHAR(100) NOT NULL,
    payload     JSONB,
    ip          VARCHAR(64),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_school ON audit_logs(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id, created_at DESC);

-- ── users.school_id + school_admin ───────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_user_type_check;
ALTER TABLE users ADD CONSTRAINT users_user_type_check
    CHECK (user_type IN ('student', 'graduate', 'teacher', 'company', 'admin', 'school_admin', 'system_admin'));

CREATE INDEX IF NOT EXISTS idx_users_school_id ON users(school_id, user_type);

-- ── counseling_journals.school_id (table may be missing on fresh compose) ──
CREATE TABLE IF NOT EXISTS counseling_journals (
    id              SERIAL PRIMARY KEY,
    teacher_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    teacher_name    VARCHAR(100) NOT NULL,
    student_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    student_name    VARCHAR(100) NOT NULL,
    counseling_date DATE NOT NULL,
    type            VARCHAR(30) NOT NULL,
    title           VARCHAR(200) NOT NULL,
    content         TEXT NOT NULL,
    follow_up       TEXT,
    is_private      BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE counseling_journals ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id);
CREATE INDEX IF NOT EXISTS idx_journals_school ON counseling_journals(school_id);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'counseling_sessions') THEN
        ALTER TABLE counseling_sessions ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id);
        CREATE INDEX IF NOT EXISTS idx_counseling_sessions_school ON counseling_sessions(school_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'jobs') THEN
        ALTER TABLE jobs ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id);
        CREATE INDEX IF NOT EXISTS idx_jobs_school ON jobs(school_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'posts') THEN
        ALTER TABLE posts ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id);
        CREATE INDEX IF NOT EXISTS idx_posts_school ON posts(school_id);
    END IF;
END $$;

-- ── seed: 전주공업고등학교 (v1 default tenant) ───────────────
INSERT INTO schools (code, name, region, status)
VALUES ('JJTH', '전주공업고등학교', '전북', 'active')
ON CONFLICT (code) DO NOTHING;

INSERT INTO schools (code, name, region, status)
SELECT 'JJTH', '전주공업고등학교', '전북', 'active'
WHERE NOT EXISTS (SELECT 1 FROM schools WHERE name = '전주공업고등학교');

-- ── seed roles ───────────────────────────────────────────────
INSERT INTO roles (code, name) VALUES
    ('system_admin', '시스템 관리자'),
    ('school_admin', '학교 관리자'),
    ('teacher', '교사'),
    ('student', '학생'),
    ('graduate', '졸업생'),
    ('company', '기업')
ON CONFLICT (code) DO NOTHING;

-- ── seed menus ───────────────────────────────────────────────
INSERT INTO menus (code, name, sort_order) VALUES
    ('schools', '학교·권한 관리', 10),
    ('users', '회원 관리', 20),
    ('resumes', '이력서', 30),
    ('counseling', '상담 관리', 40),
    ('jobs', '취업 공고', 50),
    ('applications', '지원 관리', 60),
    ('recommendations', '취업 추천', 70),
    ('field_trips', '견학 관리', 80),
    ('community', '커뮤니티', 90),
    ('messages', '메시지 발송', 100),
    ('stats', '통계', 110)
ON CONFLICT (code) DO NOTHING;

-- ── seed role_menu_permissions (implied actions included) ────
-- manage ⊃ write,read,apply ; write ⊃ read,apply ; read ; apply
INSERT INTO role_menu_permissions (role_id, menu_id, actions)
SELECT r.id, m.id, v.actions
FROM (VALUES
    ('system_admin', 'schools',          ARRAY['manage','write','read','apply']),
    ('system_admin', 'users',            ARRAY['manage','write','read','apply']),
    ('system_admin', 'resumes',          ARRAY['read']),
    ('system_admin', 'counseling',       ARRAY['read']),
    ('system_admin', 'jobs',             ARRAY['manage','write','read','apply']),
    ('system_admin', 'applications',     ARRAY['read']),
    ('system_admin', 'recommendations',  ARRAY['read']),
    ('system_admin', 'field_trips',      ARRAY['manage','write','read','apply']),
    ('system_admin', 'community',        ARRAY['manage','write','read','apply']),
    ('system_admin', 'messages',         ARRAY['manage','write','read','apply']),
    ('system_admin', 'stats',            ARRAY['manage','write','read','apply']),

    ('school_admin', 'schools',          ARRAY['write','read','apply']),
    ('school_admin', 'users',            ARRAY['write','read','apply']),
    ('school_admin', 'resumes',          ARRAY['read']),
    ('school_admin', 'counseling',       ARRAY['manage','write','read','apply']),
    ('school_admin', 'jobs',             ARRAY['write','read','apply']),
    ('school_admin', 'applications',     ARRAY['read']),
    ('school_admin', 'recommendations',  ARRAY['read']),
    ('school_admin', 'field_trips',      ARRAY['write','read','apply']),
    ('school_admin', 'community',        ARRAY['manage','write','read','apply']),
    ('school_admin', 'messages',         ARRAY['write','read','apply']),
    ('school_admin', 'stats',            ARRAY['read']),

    ('teacher', 'users',            ARRAY['read']),
    ('teacher', 'resumes',          ARRAY['read']),
    ('teacher', 'counseling',       ARRAY['write','read','apply']),
    ('teacher', 'jobs',             ARRAY['write','read','apply']),
    ('teacher', 'applications',     ARRAY['read']),
    ('teacher', 'recommendations',  ARRAY['read']),
    ('teacher', 'field_trips',      ARRAY['write','read','apply']),
    ('teacher', 'community',        ARRAY['write','read','apply']),
    ('teacher', 'stats',            ARRAY['read']),

    ('student', 'resumes',          ARRAY['write','read','apply']),
    ('student', 'jobs',             ARRAY['read']),
    ('student', 'applications',     ARRAY['write','read','apply']),
    ('student', 'recommendations',  ARRAY['read']),
    ('student', 'field_trips',      ARRAY['apply']),
    ('student', 'community',        ARRAY['write','read','apply']),

    ('graduate', 'resumes',          ARRAY['write','read','apply']),
    ('graduate', 'jobs',             ARRAY['read']),
    ('graduate', 'applications',     ARRAY['write','read','apply']),
    ('graduate', 'recommendations',  ARRAY['read']),
    ('graduate', 'field_trips',      ARRAY['apply']),
    ('graduate', 'community',        ARRAY['write','read','apply']),

    ('company', 'resumes',          ARRAY['read']),
    ('company', 'jobs',             ARRAY['write','read','apply']),
    ('company', 'applications',     ARRAY['write','read','apply'])
) AS v(role_code, menu_code, actions)
JOIN roles r ON r.code = v.role_code
JOIN menus m ON m.code = v.menu_code
ON CONFLICT (role_id, menu_id) DO UPDATE SET actions = EXCLUDED.actions;

-- ── backfill users.school_id → 전주공업고 (기업 제외) ────────
UPDATE users u
SET school_id = s.id,
    school_name = COALESCE(NULLIF(u.school_name, ''), s.name)
FROM schools s
WHERE s.name = '전주공업고등학교'
  AND u.school_id IS NULL
  AND u.user_type IN ('student', 'graduate', 'teacher', 'admin', 'school_admin', 'system_admin');

-- ── departments from v1 majors for default school ────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'majors') THEN
        INSERT INTO departments (school_id, name)
        SELECT s.id, m.name
        FROM schools s
        CROSS JOIN majors m
        WHERE s.name = '전주공업고등학교'
          AND COALESCE(m.is_active, true) = true
          AND NOT EXISTS (
              SELECT 1 FROM departments d
              WHERE d.school_id = s.id AND d.name = m.name
          );
    END IF;
END $$;

-- ── sync user_roles from user_type ───────────────────────────
INSERT INTO user_roles (user_id, role_id, school_id)
SELECT u.id,
       r.id,
       CASE WHEN r.code = 'system_admin' THEN NULL ELSE u.school_id END
FROM users u
JOIN roles r ON r.code = CASE
    WHEN u.user_type IN ('admin', 'system_admin') THEN 'system_admin'
    ELSE u.user_type
END
WHERE NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = u.id AND ur.role_id = r.id
      AND ur.school_id IS NOT DISTINCT FROM (
          CASE WHEN r.code = 'system_admin' THEN NULL ELSE u.school_id END
      )
);

-- ── backfill journal / session school_id ─────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'counseling_journals') THEN
        UPDATE counseling_journals j
        SET school_id = u.school_id
        FROM users u
        WHERE j.teacher_id = u.id
          AND j.school_id IS NULL
          AND u.school_id IS NOT NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'counseling_sessions' AND column_name = 'school_id') THEN
        UPDATE counseling_sessions cs
        SET school_id = u.school_id
        FROM users u
        WHERE cs.user_id = u.id
          AND cs.school_id IS NULL
          AND u.school_id IS NOT NULL;
    END IF;
END $$;
