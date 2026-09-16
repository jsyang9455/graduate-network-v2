-- DX persona test accounts (idempotent, FK-safe)
-- 비밀번호: password123
-- bcrypt ($2b$10$AknqEf4Z…): verified via bcrypt.compare('password123', hash) === true
-- (구 해시 $2b$10$rZ0HwKnI… 는 password123 과 불일치 — 로그인 401 원인)
-- REQ-JOB-007: 기업 DX 계정은 기본 학교 바인딩 + approval_status=approved
--
-- Do NOT DELETE users: audit_logs.actor_id, school_transfers.*, user_roles.granted_by,
-- counseling_journals.counselor_id, posts.blinded_by, trip_reports.author_id 등
-- ON DELETE CASCADE 없는 FK가 남아 DELETE가 실패한다. email UPSERT로 재적재한다.

INSERT INTO schools (code, name, region, status)
VALUES ('JJTH', '전주공업고등학교', '전북', 'active')
ON CONFLICT (code) DO UPDATE SET status = 'active';

INSERT INTO users (email, password_hash, name, user_type, phone, is_active, school_id, school_name)
SELECT v.email, v.password_hash, v.name, v.user_type, v.phone, true, s.id, s.name
FROM (
  VALUES
    ('student@jjob.com', '$2b$10$AknqEf4ZBF0oo6hG5cfSZu1xgs4kzgdnhO/HXxMMGZGxeMGIi0WjG', '김재학', 'student', '010-1111-1111'),
    ('graduate@jjob.com', '$2b$10$AknqEf4ZBF0oo6hG5cfSZu1xgs4kzgdnhO/HXxMMGZGxeMGIi0WjG', '이졸업', 'graduate', '010-2222-2222'),
    ('teacher@jjob.com', '$2b$10$AknqEf4ZBF0oo6hG5cfSZu1xgs4kzgdnhO/HXxMMGZGxeMGIi0WjG', '박선생', 'teacher', '010-3333-3333'),
    ('company@jjob.com', '$2b$10$AknqEf4ZBF0oo6hG5cfSZu1xgs4kzgdnhO/HXxMMGZGxeMGIi0WjG', 'JJOB채용담당', 'company', '010-4444-4444'),
    ('admin@jjob.com', '$2b$10$AknqEf4ZBF0oo6hG5cfSZu1xgs4kzgdnhO/HXxMMGZGxeMGIi0WjG', 'JJOB관리자', 'admin', '010-5555-5555')
) AS v(email, password_hash, name, user_type, phone)
CROSS JOIN LATERAL (
  SELECT id, name FROM schools
  WHERE code = 'JJTH' OR name = '전주공업고등학교'
  ORDER BY id LIMIT 1
) s
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  name = EXCLUDED.name,
  user_type = EXCLUDED.user_type,
  phone = EXCLUDED.phone,
  is_active = true,
  school_id = EXCLUDED.school_id,
  school_name = EXCLUDED.school_name,
  withdraw_reason = NULL,
  withdrawn_at = NULL,
  updated_at = CURRENT_TIMESTAMP;

-- graduate_profiles: upsert by user_id (no UNIQUE on user_id → UPDATE then INSERT-if-missing)
UPDATE graduate_profiles gp
SET
  graduation_year = 2022,
  major = '전자과',
  current_company = 'LG전자',
  current_position = '사원',
  bio = '열심히 일하고 있는 졸업생입니다.',
  skills = ARRAY['C++', 'Python', '전자회로'],
  is_mentor = false,
  mentor_capacity = 0,
  updated_at = CURRENT_TIMESTAMP
FROM users u
WHERE gp.user_id = u.id
  AND u.email = 'graduate@jjob.com';

INSERT INTO graduate_profiles (
  user_id, graduation_year, major, current_company, current_position, bio, skills, is_mentor, mentor_capacity
)
SELECT u.id, 2022, '전자과', 'LG전자', '사원', '열심히 일하고 있는 졸업생입니다.',
       ARRAY['C++', 'Python', '전자회로'], false, 0
FROM users u
WHERE u.email = 'graduate@jjob.com'
  AND NOT EXISTS (SELECT 1 FROM graduate_profiles gp WHERE gp.user_id = u.id);

-- company_profiles: upsert + force approved (REQ-JOB-007 DX)
UPDATE company_profiles cp
SET
  company_name = 'JJOB채용',
  industry = 'IT/서비스',
  company_size = '스타트업',
  website = 'https://jjob.com',
  description = '전주공고 졸업생을 위한 채용 플랫폼',
  founded_year = 2026,
  approval_status = 'approved',
  approved_at = COALESCE(cp.approved_at, CURRENT_TIMESTAMP),
  rejection_reason = NULL,
  updated_at = CURRENT_TIMESTAMP
FROM users u
WHERE cp.user_id = u.id
  AND u.email = 'company@jjob.com';

INSERT INTO company_profiles (
  user_id, company_name, industry, company_size, website, description, founded_year,
  approval_status, approved_at
)
SELECT u.id, 'JJOB채용', 'IT/서비스', '스타트업', 'https://jjob.com',
       '전주공고 졸업생을 위한 채용 플랫폼', 2026,
       'approved', CURRENT_TIMESTAMP
FROM users u
WHERE u.email = 'company@jjob.com'
  AND NOT EXISTS (SELECT 1 FROM company_profiles cp WHERE cp.user_id = u.id);

SELECT '✅ 테스트 계정이 성공적으로 추가/갱신되었습니다!' as message;
SELECT '🏢 company@jjob.com: school 바인딩 + approval_status=approved (REQ-JOB-007 DX)' as company_note;
