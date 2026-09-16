-- 각 사용자 타입별 테스트 계정 추가
-- 비밀번호: password123
-- bcrypt ($2b$10$AknqEf4Z…): verified via bcrypt.compare('password123', hash) === true
-- (구 해시 $2b$10$rZ0HwKnI… 는 password123 과 불일치 — 로그인 401 원인)
-- REQ-JOB-007: 기업 DX 계정은 기본 학교 바인딩 + approval_status=approved

DELETE FROM company_profiles WHERE user_id IN (
  SELECT id FROM users WHERE email IN (
    'student@jjob.com', 'graduate@jjob.com', 'teacher@jjob.com',
    'company@jjob.com', 'admin@jjob.com'
  )
);
DELETE FROM graduate_profiles WHERE user_id IN (
  SELECT id FROM users WHERE email IN (
    'student@jjob.com', 'graduate@jjob.com', 'teacher@jjob.com',
    'company@jjob.com', 'admin@jjob.com'
  )
);
DELETE FROM user_roles WHERE user_id IN (
  SELECT id FROM users WHERE email IN (
    'student@jjob.com', 'graduate@jjob.com', 'teacher@jjob.com',
    'company@jjob.com', 'admin@jjob.com'
  )
);
DELETE FROM users WHERE email IN (
    'student@jjob.com',
    'graduate@jjob.com',
    'teacher@jjob.com',
    'company@jjob.com',
    'admin@jjob.com'
);

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
) s;

INSERT INTO graduate_profiles (user_id, graduation_year, major, current_company, current_position, bio, skills, is_mentor, mentor_capacity)
SELECT id, 2022, '전자과', 'LG전자', '사원', '열심히 일하고 있는 졸업생입니다.', ARRAY['C++', 'Python', '전자회로'], false, 0
FROM users WHERE email = 'graduate@jjob.com';

INSERT INTO company_profiles (user_id, company_name, industry, company_size, website, description, founded_year, approval_status, approved_at)
SELECT id, 'JJOB채용', 'IT/서비스', '스타트업', 'https://jjob.com', '전주공고 졸업생을 위한 채용 플랫폼', 2026, 'approved', CURRENT_TIMESTAMP
FROM users WHERE email = 'company@jjob.com';

SELECT '✅ 테스트 계정이 성공적으로 추가되었습니다!' as message;
SELECT '🏢 company@jjob.com: school 바인딩 + approval_status=approved (REQ-JOB-007 DX)' as company_note;
