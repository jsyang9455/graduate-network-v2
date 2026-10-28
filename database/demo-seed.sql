-- =============================================================================
-- jjobb_v2 rich per-persona DEMO seed (idempotent, FK-safe)
-- Prerequisite: DX accounts from database/test-accounts.sql (@jjob.com / password123)
-- School: 전주공업고등학교 (JJTH)
-- Marker: titles / bucket_key containing '[DEMO]' — safe to re-run (UPSERT / EXISTS)
-- Do NOT DELETE users (audit_logs.actor_id and other non-CASCADE FKs).
-- =============================================================================

-- ── 0) Resolve school + DX users (fail loudly if missing) ────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schools WHERE code = 'JJTH' OR name = '전주공업고등학교') THEN
    RAISE EXCEPTION 'demo-seed: school JJTH / 전주공업고등학교 missing — run test-accounts.sql first';
  END IF;
  IF (SELECT COUNT(*) FROM users WHERE email IN (
        'student@jjob.com','graduate@jjob.com','teacher@jjob.com',
        'company@jjob.com','admin@jjob.com'
      ) AND is_active) < 5 THEN
    RAISE EXCEPTION 'demo-seed: DX @jjob.com accounts missing — run ./scripts/load-test-accounts.sh first';
  END IF;
END $$;

-- Ensure is_counselor column (counseling UI gates on this)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_counselor BOOLEAN DEFAULT false;

-- Ensure company approved + school binding (REQ-JOB-007)
UPDATE company_profiles cp
SET approval_status = 'approved',
    approved_at = COALESCE(cp.approved_at, CURRENT_TIMESTAMP),
    rejection_reason = NULL,
    updated_at = CURRENT_TIMESTAMP
FROM users u
WHERE cp.user_id = u.id AND u.email = 'company@jjob.com';

-- All DX personas → 전주공업고 (JJTH); teacher is counselor
UPDATE users u
SET school_id = s.id,
    school_name = s.name,
    is_counselor = CASE WHEN u.email = 'teacher@jjob.com' THEN true ELSE COALESCE(u.is_counselor, false) END,
    updated_at = CURRENT_TIMESTAMP
FROM schools s
WHERE (s.code = 'JJTH' OR s.name = '전주공업고등학교')
  AND u.email IN (
    'student@jjob.com','graduate@jjob.com','teacher@jjob.com',
    'company@jjob.com','admin@jjob.com'
  )
  AND (
    u.school_id IS DISTINCT FROM s.id
    OR u.school_name IS DISTINCT FROM s.name
    OR (u.email = 'teacher@jjob.com' AND COALESCE(u.is_counselor, false) IS NOT TRUE)
  );

UPDATE users u
SET is_counselor = true, updated_at = CURRENT_TIMESTAMP
WHERE u.email = 'teacher@jjob.com' AND COALESCE(u.is_counselor, false) IS NOT TRUE;

-- Sync RBAC roles for DX (idempotent)
INSERT INTO user_roles (user_id, role_id, school_id)
SELECT u.id, r.id,
       CASE WHEN r.code = 'system_admin' THEN NULL ELSE u.school_id END
FROM users u
JOIN roles r ON r.code = CASE
  WHEN u.user_type IN ('admin', 'system_admin') THEN 'system_admin'
  WHEN u.user_type = 'school_admin' THEN 'school_admin'
  ELSE u.user_type::text
END
WHERE u.email IN (
  'student@jjob.com','graduate@jjob.com','teacher@jjob.com',
  'company@jjob.com','admin@jjob.com'
)
AND NOT EXISTS (
  SELECT 1 FROM user_roles ur
  WHERE ur.user_id = u.id AND ur.role_id = r.id
    AND ur.school_id IS NOT DISTINCT FROM (
      CASE WHEN r.code = 'system_admin' THEN NULL ELSE u.school_id END
    )
);

-- ── 1) School branding (logo_file + primary_admin) — migration 020+ ──────────
-- Metadata only here: load-demo-data.sh copies images/school-logo-jjth.svg
-- into STORAGE_LOCAL_DIR/demo/school-logo-jjth.svg so GET /api/schools/:id/logo streams bytes.
DO $$
DECLARE
  v_school_id INTEGER;
  v_admin_id  INTEGER;
  v_file_id   INTEGER;
  -- Keep in sync with images/school-logo-jjth.svg (wc -c); load script also UPDATEs size
  v_logo_size INTEGER := 1180;
BEGIN
  SELECT id INTO v_school_id FROM schools
  WHERE code = 'JJTH' OR name = '전주공업고등학교'
  ORDER BY id LIMIT 1;

  SELECT id INTO v_admin_id FROM users WHERE email = 'admin@jjob.com' LIMIT 1;

  SELECT id INTO v_file_id FROM files
  WHERE bucket_key = 'demo/school-logo-jjth.svg' AND kind = 'school_logo'
  LIMIT 1;

  IF v_file_id IS NULL THEN
    INSERT INTO files (school_id, owner_user_id, bucket_key, mime, size, kind, original_name)
    VALUES (
      v_school_id, v_admin_id,
      'demo/school-logo-jjth.svg',
      'image/svg+xml', v_logo_size, 'school_logo',
      '[DEMO] jjth-logo.svg'
    )
    RETURNING id INTO v_file_id;
  ELSE
    UPDATE files
    SET school_id = v_school_id,
        owner_user_id = v_admin_id,
        mime = 'image/svg+xml',
        size = v_logo_size,
        kind = 'school_logo',
        original_name = '[DEMO] jjth-logo.svg'
    WHERE id = v_file_id;
  END IF;

  UPDATE schools
  SET logo_file_id = v_file_id,
      primary_admin_user_id = COALESCE(primary_admin_user_id, v_admin_id)
  WHERE id = v_school_id;
END $$;

-- ── 2) Resumes (student + graduate) with items + primary ─────────────────────
DO $$
DECLARE
  v_school_id INTEGER;
  v_student   INTEGER;
  v_graduate  INTEGER;
  v_resume_id INTEGER;
BEGIN
  SELECT id INTO v_school_id FROM schools
  WHERE code = 'JJTH' OR name = '전주공업고등학교' ORDER BY id LIMIT 1;
  SELECT id INTO v_student FROM users WHERE email = 'student@jjob.com';
  SELECT id INTO v_graduate FROM users WHERE email = 'graduate@jjob.com';

  -- Student primary
  SELECT id INTO v_resume_id FROM resumes
  WHERE user_id = v_student AND title = '[DEMO] 김재학 대표 이력서' LIMIT 1;

  IF v_resume_id IS NULL THEN
    INSERT INTO resumes (user_id, school_id, title, is_primary, status, version, template_code, basic_info, summary)
    VALUES (
      v_student, v_school_id, '[DEMO] 김재학 대표 이력서', false, 'published', 1, 'basic',
      jsonb_build_object(
        'name', '김재학', 'phone', '010-1111-1111', 'email', 'student@jjob.com',
        'school', '전주공업고등학교', 'major', '전자과'
      ),
      '전주공업고 전자과 재학생. 임베디드·회로에 관심 있습니다.'
    )
    RETURNING id INTO v_resume_id;
  ELSE
    UPDATE resumes SET
      school_id = v_school_id,
      status = 'published',
      basic_info = jsonb_build_object(
        'name', '김재학', 'phone', '010-1111-1111', 'email', 'student@jjob.com',
        'school', '전주공업고등학교', 'major', '전자과'
      ),
      summary = '전주공업고 전자과 재학생. 임베디드·회로에 관심 있습니다.',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = v_resume_id;
  END IF;

  DELETE FROM resume_items WHERE resume_id = v_resume_id;
  INSERT INTO resume_items (resume_id, section, payload, sort_order) VALUES
    (v_resume_id, 'education', '{"institution":"전주공업고등학교","name":"전자과","startDate":"2023-03","endDate":"2026-02"}'::jsonb, 1),
    (v_resume_id, 'skill', '{"name":"Python","level":"중급"}'::jsonb, 2),
    (v_resume_id, 'skill', '{"name":"Arduino","level":"초급"}'::jsonb, 3),
    (v_resume_id, 'certificate', '{"name":"정보처리기능사","issuer":"한국산업인력공단","date":"2025-06"}'::jsonb, 4),
    (v_resume_id, 'intro', '{"text":"성실하고 배우기 좋아합니다."}'::jsonb, 5);

  DELETE FROM resume_keywords WHERE resume_id = v_resume_id;
  INSERT INTO resume_keywords (resume_id, token, weight) VALUES
    (v_resume_id, '전자', 1.0),
    (v_resume_id, 'Python', 0.8),
    (v_resume_id, '임베디드', 0.9)
  ON CONFLICT (resume_id, token) DO UPDATE SET weight = EXCLUDED.weight;

  UPDATE resumes SET is_primary = false WHERE user_id = v_student;
  UPDATE resumes SET is_primary = true WHERE id = v_resume_id;

  -- Student draft #2
  SELECT id INTO v_resume_id FROM resumes
  WHERE user_id = v_student AND title = '[DEMO] 김재학 실습용 초안' LIMIT 1;
  IF v_resume_id IS NULL THEN
    INSERT INTO resumes (user_id, school_id, title, is_primary, status, basic_info, summary)
    VALUES (
      v_student, v_school_id, '[DEMO] 김재학 실습용 초안', false, 'draft',
      '{"name":"김재학"}'::jsonb, '실습 지원용 초안'
    )
    RETURNING id INTO v_resume_id;
  END IF;
  DELETE FROM resume_items WHERE resume_id = v_resume_id;
  INSERT INTO resume_items (resume_id, section, payload, sort_order) VALUES
    (v_resume_id, 'education', '{"institution":"전주공업고등학교","name":"전자과"}'::jsonb, 1),
    (v_resume_id, 'experience', '{"company":"지역 IT 실습","position":"인턴","startDate":"2025-07","endDate":"2025-08"}'::jsonb, 2);

  -- Graduate primary
  SELECT id INTO v_resume_id FROM resumes
  WHERE user_id = v_graduate AND title = '[DEMO] 이졸업 대표 이력서' LIMIT 1;
  IF v_resume_id IS NULL THEN
    INSERT INTO resumes (user_id, school_id, title, is_primary, status, basic_info, summary)
    VALUES (
      v_graduate, v_school_id, '[DEMO] 이졸업 대표 이력서', false, 'published',
      jsonb_build_object(
        'name', '이졸업', 'phone', '010-2222-2222', 'email', 'graduate@jjob.com',
        'school', '전주공업고등학교', 'major', '전자과', 'company', 'LG전자'
      ),
      '2022 졸업 · LG전자 사원. 후배 멘토링에 관심.'
    )
    RETURNING id INTO v_resume_id;
  ELSE
    UPDATE resumes SET
      school_id = v_school_id,
      status = 'published',
      summary = '2022 졸업 · LG전자 사원. 후배 멘토링에 관심.',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = v_resume_id;
  END IF;

  DELETE FROM resume_items WHERE resume_id = v_resume_id;
  INSERT INTO resume_items (resume_id, section, payload, sort_order) VALUES
    (v_resume_id, 'education', '{"institution":"전주공업고등학교","name":"전자과","endDate":"2022-02"}'::jsonb, 1),
    (v_resume_id, 'experience', '{"company":"LG전자","position":"사원","startDate":"2022-03","current":true}'::jsonb, 2),
    (v_resume_id, 'skill', '{"name":"C++"}'::jsonb, 3),
    (v_resume_id, 'skill', '{"name":"전자회로"}'::jsonb, 4),
    (v_resume_id, 'award', '{"name":"기능경기대회 동상","date":"2021"}'::jsonb, 5);

  DELETE FROM resume_keywords WHERE resume_id = v_resume_id;
  INSERT INTO resume_keywords (resume_id, token, weight) VALUES
    (v_resume_id, '전자', 1.0),
    (v_resume_id, 'C++', 0.9),
    (v_resume_id, '회로', 0.8)
  ON CONFLICT (resume_id, token) DO UPDATE SET weight = EXCLUDED.weight;

  UPDATE resumes SET is_primary = false WHERE user_id = v_graduate;
  UPDATE resumes SET is_primary = true WHERE id = v_resume_id;
END $$;

-- ── 3) JJOBB 밴드 (posts + tags + scraps + comment) ──────────────────────────
DO $$
DECLARE
  v_school_id INTEGER;
  v_student   INTEGER;
  v_graduate  INTEGER;
  v_teacher   INTEGER;
  v_post1     INTEGER;
  v_post2     INTEGER;
  v_post3     INTEGER;
BEGIN
  SELECT id INTO v_school_id FROM schools
  WHERE code = 'JJTH' OR name = '전주공업고등학교' ORDER BY id LIMIT 1;
  SELECT id INTO v_student FROM users WHERE email = 'student@jjob.com';
  SELECT id INTO v_graduate FROM users WHERE email = 'graduate@jjob.com';
  SELECT id INTO v_teacher FROM users WHERE email = 'teacher@jjob.com';

  -- Graduate employment review
  SELECT id INTO v_post1 FROM posts
  WHERE user_id = v_graduate AND title = '[DEMO] LG전자 입사 후기' LIMIT 1;
  IF v_post1 IS NULL THEN
    INSERT INTO posts (user_id, school_id, category, title, content, tags, views_count, likes_count, is_anonymous)
    VALUES (
      v_graduate, v_school_id, 'employment_review',
      '[DEMO] LG전자 입사 후기',
      '전주공고 전자과 졸업 후 LG전자에 입사했습니다. 면접은 전공 기초 + 프로젝트 질문이 많았습니다. 궁금한 점 댓글 주세요.',
      ARRAY['취업후기','LG전자','전자과'],
      42, 8, false
    )
    RETURNING id INTO v_post1;
  ELSE
    UPDATE posts SET
      school_id = v_school_id,
      category = 'employment_review',
      content = '전주공고 전자과 졸업 후 LG전자에 입사했습니다. 면접은 전공 기초 + 프로젝트 질문이 많았습니다. 궁금한 점 댓글 주세요.',
      tags = ARRAY['취업후기','LG전자','전자과'],
      updated_at = CURRENT_TIMESTAMP
    WHERE id = v_post1;
  END IF;

  -- Student Q&A
  SELECT id INTO v_post2 FROM posts
  WHERE user_id = v_student AND title = '[DEMO] 현장실습 준비 팁 질문' LIMIT 1;
  IF v_post2 IS NULL THEN
    INSERT INTO posts (user_id, school_id, category, title, content, tags, views_count, likes_count)
    VALUES (
      v_student, v_school_id, 'job_qa',
      '[DEMO] 현장실습 준비 팁 질문',
      '다음 달 현장실습인데 포트폴리오에 뭘 넣으면 좋을까요?',
      ARRAY['실습','질문','포트폴리오'],
      15, 2
    )
    RETURNING id INTO v_post2;
  ELSE
    UPDATE posts SET
      school_id = v_school_id,
      tags = ARRAY['실습','질문','포트폴리오'],
      updated_at = CURRENT_TIMESTAMP
    WHERE id = v_post2;
  END IF;

  -- Teacher news
  SELECT id INTO v_post3 FROM posts
  WHERE user_id = v_teacher AND title = '[DEMO] 3월 진로 상담 주간 안내' LIMIT 1;
  IF v_post3 IS NULL THEN
    INSERT INTO posts (user_id, school_id, category, title, content, tags, views_count, likes_count, is_pinned)
    VALUES (
      v_teacher, v_school_id, 'news',
      '[DEMO] 3월 진로 상담 주간 안내',
      '3월 둘째 주 진로 상담을 집중 운영합니다. 상담 메뉴에서 예약해 주세요.',
      ARRAY['공지','상담','진로'],
      60, 5, true
    )
    RETURNING id INTO v_post3;
  ELSE
    UPDATE posts SET
      school_id = v_school_id,
      tags = ARRAY['공지','상담','진로'],
      is_pinned = true,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = v_post3;
  END IF;

  -- Scraps: student scraps graduate post; graduate scraps teacher post
  INSERT INTO post_scraps (user_id, post_id)
  SELECT v_student, v_post1
  WHERE NOT EXISTS (SELECT 1 FROM post_scraps WHERE user_id = v_student AND post_id = v_post1);

  INSERT INTO post_scraps (user_id, post_id)
  SELECT v_graduate, v_post3
  WHERE NOT EXISTS (SELECT 1 FROM post_scraps WHERE user_id = v_graduate AND post_id = v_post3);

  -- Comment on graduate post
  IF NOT EXISTS (
    SELECT 1 FROM comments c
    WHERE c.post_id = v_post1 AND c.user_id = v_student
      AND c.content LIKE '[DEMO]%'
  ) THEN
    INSERT INTO comments (post_id, user_id, content)
    VALUES (v_post1, v_student, '[DEMO] 선배님 후기 감사합니다! 면접 준비 팁 더 있을까요?');
    UPDATE posts SET comments_count = GREATEST(comments_count, 1) WHERE id = v_post1;
  END IF;
END $$;

-- ── 4) Jobs + applications linked to resumes + scraps + keywords ─────────────
DO $$
DECLARE
  v_school_id INTEGER;
  v_company   INTEGER;
  v_student   INTEGER;
  v_graduate  INTEGER;
  v_job1      INTEGER;
  v_job2      INTEGER;
  v_resume_s  INTEGER;
  v_resume_g  INTEGER;
BEGIN
  SELECT id INTO v_school_id FROM schools
  WHERE code = 'JJTH' OR name = '전주공업고등학교' ORDER BY id LIMIT 1;
  SELECT id INTO v_company FROM users WHERE email = 'company@jjob.com';
  SELECT id INTO v_student FROM users WHERE email = 'student@jjob.com';
  SELECT id INTO v_graduate FROM users WHERE email = 'graduate@jjob.com';
  SELECT id INTO v_resume_s FROM resumes
  WHERE user_id = v_student AND title = '[DEMO] 김재학 대표 이력서' LIMIT 1;
  SELECT id INTO v_resume_g FROM resumes
  WHERE user_id = v_graduate AND title = '[DEMO] 이졸업 대표 이력서' LIMIT 1;

  SELECT id INTO v_job1 FROM jobs
  WHERE company_id = v_company AND title = '[DEMO] 전주 스마트팩토리 신입 채용' LIMIT 1;
  IF v_job1 IS NULL THEN
    INSERT INTO jobs (
      company_id, school_id, title, description, requirements, location,
      job_type, salary_range, experience_level, headcount, deadline, status, views_count
    ) VALUES (
      v_company, v_school_id,
      '[DEMO] 전주 스마트팩토리 신입 채용',
      '전주 지역 스마트팩토리 구축·유지보수 신입. 전자/전기/컴퓨터 전공 우대.',
      '- 공업계 고교 졸업(예정)자\n- Python 또는 PLC 기초\n- 성실한 태도',
      '전라북도 전주시', 'full-time', '2800만원 ~ 3200만원', 'entry', 2,
      (CURRENT_DATE + INTERVAL '45 days')::date, 'active', 30
    )
    RETURNING id INTO v_job1;
  ELSE
    UPDATE jobs SET
      school_id = v_school_id,
      description = '전주 지역 스마트팩토리 구축·유지보수 신입. 전자/전기/컴퓨터 전공 우대.',
      status = 'active',
      deadline = (CURRENT_DATE + INTERVAL '45 days')::date,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = v_job1;
  END IF;

  SELECT id INTO v_job2 FROM jobs
  WHERE company_id = v_company AND title = '[DEMO] 임베디드 펌웨어 인턴' LIMIT 1;
  IF v_job2 IS NULL THEN
    INSERT INTO jobs (
      company_id, school_id, title, description, requirements, location,
      job_type, salary_range, experience_level, headcount, deadline, status, views_count
    ) VALUES (
      v_company, v_school_id,
      '[DEMO] 임베디드 펌웨어 인턴',
      'MCU 펌웨어 개발 보조 인턴십 (3개월).',
      '- 전자과/컴퓨터과 재학생\n- C/C++ 기초',
      '전라북도 완주군', 'internship', '월 180만원', 'entry', 3,
      (CURRENT_DATE + INTERVAL '30 days')::date, 'active', 18
    )
    RETURNING id INTO v_job2;
  ELSE
    UPDATE jobs SET
      school_id = v_school_id,
      status = 'active',
      deadline = (CURRENT_DATE + INTERVAL '30 days')::date,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = v_job2;
  END IF;

  DELETE FROM job_keywords WHERE job_id IN (v_job1, v_job2);
  INSERT INTO job_keywords (job_id, token, weight) VALUES
    (v_job1, '스마트팩토리', 1.0),
    (v_job1, '전자', 0.9),
    (v_job1, 'Python', 0.7),
    (v_job2, '임베디드', 1.0),
    (v_job2, 'C++', 0.9),
    (v_job2, '펌웨어', 0.8)
  ON CONFLICT (job_id, token) DO UPDATE SET weight = EXCLUDED.weight;

  -- Student applies to job1 with primary resume
  IF v_resume_s IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM job_applications WHERE job_id = v_job1 AND user_id = v_student
  ) THEN
    INSERT INTO job_applications (job_id, user_id, cover_letter, status, resume_id)
    VALUES (
      v_job1, v_student,
      '[DEMO] 스마트팩토리 신입에 지원합니다. 전자과 재학 중이며 Python·Arduino 경험이 있습니다.',
      'pending', v_resume_s
    );
  ELSE
    UPDATE job_applications
    SET resume_id = COALESCE(resume_id, v_resume_s),
        cover_letter = COALESCE(cover_letter, '[DEMO] 스마트팩토리 신입에 지원합니다.'),
        updated_at = CURRENT_TIMESTAMP
    WHERE job_id = v_job1 AND user_id = v_student;
  END IF;

  -- Graduate applies to job2
  IF v_resume_g IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM job_applications WHERE job_id = v_job2 AND user_id = v_graduate
  ) THEN
    INSERT INTO job_applications (job_id, user_id, cover_letter, status, resume_id)
    VALUES (
      v_job2, v_graduate,
      '[DEMO] 임베디드 인턴 멘토/지원 가능합니다.',
      'reviewed', v_resume_g
    );
  END IF;

  UPDATE jobs j SET applications_count = (
    SELECT COUNT(*) FROM job_applications ja WHERE ja.job_id = j.id
  ) WHERE j.id IN (v_job1, v_job2);

  -- Job scraps
  INSERT INTO job_scraps (user_id, job_id, school_id)
  SELECT v_student, v_job2, v_school_id
  WHERE NOT EXISTS (SELECT 1 FROM job_scraps WHERE user_id = v_student AND job_id = v_job2);

  INSERT INTO job_scraps (user_id, job_id, school_id)
  SELECT v_graduate, v_job1, v_school_id
  WHERE NOT EXISTS (SELECT 1 FROM job_scraps WHERE user_id = v_graduate AND job_id = v_job1);

  -- Lightweight recommendations for student
  INSERT INTO job_recommendations (user_id, job_id, school_id, score, reasons, computed_at)
  VALUES (
    v_student, v_job1, v_school_id, 0.86,
    '[{"code":"keyword","label":"전자·Python 매칭"}]'::jsonb,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (user_id, job_id) DO UPDATE
    SET score = EXCLUDED.score, reasons = EXCLUDED.reasons, computed_at = CURRENT_TIMESTAMP;
END $$;

-- ── 5) Announcements (job-fair / industry-visit / certification) — JJTH ─────
-- App valid types only (backend/routes/announcements.js). General notices →
-- education_programs + posts category news (sections 5b / 3).
DO $$
DECLARE
  v_school_id INTEGER;
  r RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'announcements') THEN
    RAISE NOTICE 'demo-seed: announcements table missing — skip';
    RETURN;
  END IF;

  SELECT id INTO v_school_id FROM schools
  WHERE code = 'JJTH' OR name = '전주공업고등학교' ORDER BY id LIMIT 1;

  FOR r IN
    SELECT * FROM (VALUES
      -- job-fair (3)
      ('job-fair', '[DEMO] 2026 전주공고 연계 취업박람회', '전주공업고등학교·전주시',
       '지역 우수 기업 참여 취업박람회. 현장 상담·간이 면접.',
       20, '10:00 - 16:00', '전주공업고등학교 체육관', 15, 200, 12, '무료',
       ARRAY['현장 상담','이력서 클리닉','기업 부스'],
       ARRAY['이력서 1부','교복 또는 단정한 복장'],
       '063-280-0000', 'jobfair@jjth.demo', ARRAY['취업박람회','전주','DEMO']),
      ('job-fair', '[DEMO] 스마트제조 현장채용 데이', '전주시산업진흥원·전주공업고',
       '스마트제조·전자 분야 강소기업 현장 채용 상담.',
       35, '13:00 - 17:00', '전주 중소기업지원센터', 28, 150, 40, '무료',
       ARRAY['현장 면접','직무 설명회'],
       ARRAY['이력서','학생증'],
       '063-711-2100', 'smart-hire@jjth.demo', ARRAY['스마트제조','채용','DEMO']),
      ('job-fair', '[DEMO] 공공기관·공기업 채용 설명회', '전북인재개발원 연계',
       '전북 공공기관 채용 절차·NCS 안내. 전주공고 재학생 우선 배정.',
       50, '14:00 - 18:00', '전주공업고등학교 시청각실', 42, 120, 25, '무료',
       ARRAY['NCS 안내','선배 멘토링'],
       ARRAY['신분증','필기구'],
       '063-250-5100', 'public@jjth.demo', ARRAY['공공기관','NCS','DEMO']),
      -- industry-visit (3)
      ('industry-visit', '[DEMO] 현대위아 전주공장 견학', '현대위아',
       '자동차 부품 생산 라인 견학 및 현직자 간담회.',
       25, '09:30 - 15:00', '현대위아 전주공장', 18, 30, 8, '무료',
       ARRAY['점심 제공','현직자 간담회'],
       ARRAY['안전화','긴 소매'],
       '063-440-2000', 'visit@demo.hyundai-wia', ARRAY['견학','자동차','DEMO']),
      ('industry-visit', '[DEMO] LG전자 스마트팩토리 견학', 'LG전자',
       '자동화 라인·품질관리 프로세스 견학. AI/로봇 현장 체험.',
       40, '10:00 - 15:00', 'LG전자 창원 1공장', 32, 25, 10, '무료',
       ARRAY['현장 투어','담당자 특강','교통비 지원'],
       ARRAY['단정한 복장','정보보안 서약'],
       '055-260-1114', 'factory@jjth.demo', ARRAY['스마트팩토리','전자','DEMO']),
      ('industry-visit', '[DEMO] 전북 농기계 클러스터 견학', '전라북도 농업기술원',
       '농기계 제조·수리 클러스터 방문 및 취업 기회 탐색.',
       30, '13:00 - 17:00', '전북 익산 농기계 클러스터', 22, 40, 6, '무료',
       ARRAY['기업 면담','채용 연계'],
       ARRAY['편한 복장','운동화'],
       '063-290-6000', 'agri@jjth.demo', ARRAY['농기계','견학','DEMO']),
      -- certification (3)
      ('certification', '[DEMO] 정보처리기능사 응시료 지원', '전주공업고등학교',
       '정보처리기능사 응시료 일부 지원 프로그램.',
       NULL, '상시', '학교 진로센터', 60, 40, 5, '학교 지원(일부)',
       ARRAY['응시료 지원','문제집 대여'],
       ARRAY['재학생','성적 기준 충족'],
       '063-280-1111', 'cert@jjth.demo', ARRAY['자격증','지원','DEMO']),
      ('certification', '[DEMO] 전기기능사 실기 특강', '전주공업고 전기과',
       '전기기능사 실기 대비 특강 및 재료비 지원.',
       12, '15:00 - 18:00', '전기과 실습실', 7, 24, 9, '재료비 학교 지원',
       ARRAY['실습 재료','모의고사'],
       ARRAY['전기 관련 학과 재학'],
       '063-280-1222', 'elec@jjth.demo', ARRAY['전기기능사','실기','DEMO']),
      ('certification', '[DEMO] 용접기능사 취득 과정 연계', '폴리텍 전주캠퍼스 연계',
       '용접기능사 실기 위주 단기 과정. 응시료·훈련수당 안내.',
       45, '09:00 - 17:00', '폴리텍대학 전주캠퍼스', 38, 20, 4, '연계 과정(별도 안내)',
       ARRAY['실습재료','응시료 안내'],
       ARRAY['재학생 또는 졸업 1년 이내'],
       '063-270-7000', 'weld@jjth.demo', ARRAY['용접기능사','실기','DEMO'])
    ) AS t(
      typ, title, organizer, description,
      event_offset_days, event_time, location, deadline_offset_days,
      capacity, current_applicants, fee, benefits, requirements,
      contact_phone, contact_email, tags
    )
  LOOP
    IF EXISTS (
      SELECT 1 FROM announcements a
      WHERE a.school_id = v_school_id AND a.title = r.title
    ) THEN
      UPDATE announcements SET
        type = r.typ,
        organizer = r.organizer,
        description = r.description,
        event_date = CASE WHEN r.event_offset_days IS NULL THEN event_date
                          ELSE (CURRENT_DATE + (r.event_offset_days || ' days')::interval)::date END,
        event_time = r.event_time,
        location = r.location,
        deadline = (CURRENT_DATE + (r.deadline_offset_days || ' days')::interval)::date,
        capacity = r.capacity,
        current_applicants = GREATEST(current_applicants, r.current_applicants),
        fee = r.fee,
        benefits = r.benefits,
        requirements = r.requirements,
        contact_phone = r.contact_phone,
        contact_email = r.contact_email,
        tags = r.tags,
        is_active = true,
        school_id = v_school_id,
        updated_at = CURRENT_TIMESTAMP
      WHERE school_id = v_school_id AND title = r.title;
    ELSE
      INSERT INTO announcements (
        type, title, organizer, description, event_date, event_time, location, deadline,
        capacity, current_applicants, fee, benefits, requirements,
        contact_phone, contact_email, tags, school_id, is_active
      ) VALUES (
        r.typ, r.title, r.organizer, r.description,
        CASE WHEN r.event_offset_days IS NULL THEN NULL
             ELSE (CURRENT_DATE + (r.event_offset_days || ' days')::interval)::date END,
        r.event_time, r.location,
        (CURRENT_DATE + (r.deadline_offset_days || ' days')::interval)::date,
        r.capacity, r.current_applicants, r.fee, r.benefits, r.requirements,
        r.contact_phone, r.contact_email, r.tags, v_school_id, true
      );
    END IF;
  END LOOP;
END $$;

-- Announcement applications (student → multiple DEMO programs)
DO $$
DECLARE
  v_student INTEGER;
  v_ann_id  INTEGER;
  v_title   TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'announcement_applications'
  ) THEN
    RETURN;
  END IF;

  SELECT id INTO v_student FROM users WHERE email = 'student@jjob.com';

  FOREACH v_title IN ARRAY ARRAY[
    '[DEMO] 2026 전주공고 연계 취업박람회',
    '[DEMO] 정보처리기능사 응시료 지원',
    '[DEMO] 스마트제조 현장채용 데이'
  ]
  LOOP
    SELECT id INTO v_ann_id FROM announcements WHERE title = v_title LIMIT 1;
    IF v_ann_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM announcement_applications
      WHERE announcement_id = v_ann_id AND user_id = v_student
    ) THEN
      INSERT INTO announcement_applications (
        announcement_id, user_id, applicant_name, applicant_phone, applicant_email, message, status
      ) VALUES (
        v_ann_id, v_student, '김재학', '010-1111-1111', 'student@jjob.com',
        '[DEMO] 참가 신청합니다. (' || v_title || ')', 'pending'
      );
    END IF;
  END LOOP;
END $$;

-- ── 5b) Education programs (일반 교육·공지성 프로그램) ───────────────────────
DO $$
DECLARE
  v_school_id INTEGER;
  v_teacher   INTEGER;
  v_admin     INTEGER;
  r RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'education_programs') THEN
    RETURN;
  END IF;

  SELECT id INTO v_school_id FROM schools
  WHERE code = 'JJTH' OR name = '전주공업고등학교' ORDER BY id LIMIT 1;
  SELECT id INTO v_teacher FROM users WHERE email = 'teacher@jjob.com';
  SELECT id INTO v_admin FROM users WHERE email = 'admin@jjob.com';

  FOR r IN
    SELECT * FROM (VALUES
      ('[DEMO] 3월 진로·취업 오리엔테이션', '진로', 'offline', '2시간',
       '신학기 진로·취업 일정과 상담 예약 안내. 전주공고 재학생 대상.',
       '박선생', '무료', NULL),
      ('[DEMO] 이력서·면접 클리닉', '취업준비', 'offline', '주 1회×4주',
       '대표 이력서 첨삭과 모의면접. DEMO 채용 공고 지원과 연계.',
       '박선생', '무료', NULL),
      ('[DEMO] 자격증 로드맵 설명회', '자격증', 'hybrid', '90분',
       '정보처리·전기·용접 기능사 응시 일정과 학교 지원 프로그램 안내.',
       'JJOBB관리자', '무료', NULL)
    ) AS t(title, category, typ, duration, description, instructor, cost, link)
  LOOP
    IF EXISTS (
      SELECT 1 FROM education_programs ep
      WHERE ep.school_id = v_school_id AND ep.title = r.title
    ) THEN
      UPDATE education_programs SET
        category = r.category,
        type = r.typ,
        duration = r.duration,
        description = r.description,
        instructor = r.instructor,
        cost = r.cost,
        created_by = COALESCE(created_by, v_teacher, v_admin),
        school_id = v_school_id,
        updated_at = CURRENT_TIMESTAMP
      WHERE school_id = v_school_id AND title = r.title;
    ELSE
      INSERT INTO education_programs (
        title, category, type, duration, description, instructor, cost, link, created_by, school_id
      ) VALUES (
        r.title, r.category, r.typ, r.duration, r.description, r.instructor, r.cost, r.link,
        COALESCE(v_teacher, v_admin), v_school_id
      );
    END IF;
  END LOOP;
END $$;

-- ── 6) Field trips (견학) + application + after-report (교사) ────────────────
DO $$
DECLARE
  v_school_id INTEGER;
  v_teacher   INTEGER;
  v_student   INTEGER;
  v_trip_id   INTEGER;
  v_src_ann   INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'field_trips') THEN
    RAISE NOTICE 'demo-seed: field_trips table missing — skip';
    RETURN;
  END IF;

  SELECT id INTO v_school_id FROM schools
  WHERE code = 'JJTH' OR name = '전주공업고등학교' ORDER BY id LIMIT 1;
  SELECT id INTO v_teacher FROM users WHERE email = 'teacher@jjob.com';
  SELECT id INTO v_student FROM users WHERE email = 'student@jjob.com';
  SELECT id INTO v_src_ann FROM announcements
  WHERE title = '[DEMO] 현대위아 전주공장 견학' LIMIT 1;

  SELECT id INTO v_trip_id FROM field_trips
  WHERE school_id = v_school_id AND title = '[DEMO] 현대위아 전주공장 견학' LIMIT 1;

  IF v_trip_id IS NULL THEN
    INSERT INTO field_trips (
      school_id, company_name, title, description, place, event_date, event_time,
      capacity, current_applicants, deadline, mode, fee, benefits, requirements,
      contact_phone, contact_email, tags, is_active, source_announcement_id, created_by
    ) VALUES (
      v_school_id, '현대위아',
      '[DEMO] 현대위아 전주공장 견학',
      '자동차 부품 생산 라인 견학 및 현직자 간담회.',
      '현대위아 전주공장',
      (CURRENT_DATE + INTERVAL '25 days')::date,
      '09:30 - 15:00',
      30, 1,
      (CURRENT_DATE + INTERVAL '18 days')::date,
      'fifo', '무료',
      ARRAY['점심 제공','현직자 간담회'],
      ARRAY['안전화','긴 소매'],
      '063-440-2000', 'visit@demo.hyundai-wia',
      ARRAY['견학','자동차','DEMO'],
      true, v_src_ann, v_teacher
    )
    RETURNING id INTO v_trip_id;
  ELSE
    UPDATE field_trips SET
      is_active = true,
      created_by = COALESCE(created_by, v_teacher),
      source_announcement_id = COALESCE(source_announcement_id, v_src_ann),
      tags = ARRAY['견학','자동차','DEMO'],
      updated_at = CURRENT_TIMESTAMP
    WHERE id = v_trip_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM field_trip_applications WHERE trip_id = v_trip_id AND user_id = v_student
  ) THEN
    INSERT INTO field_trip_applications (
      trip_id, user_id, school_id, applicant_name, applicant_phone, applicant_email, message, status
    ) VALUES (
      v_trip_id, v_student, v_school_id, '김재학', '010-1111-1111', 'student@jjob.com',
      '[DEMO] 견학 신청합니다.', 'approved'
    );
  END IF;

  UPDATE field_trips ft SET current_applicants = (
    SELECT COUNT(*) FROM field_trip_applications fta
    WHERE fta.trip_id = ft.id AND fta.status <> 'cancelled'
  ) WHERE ft.id = v_trip_id;

  -- Teacher after-report (REQ-TRP-003)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'field_trip_reports') THEN
    INSERT INTO field_trip_reports (
      trip_id, school_id, author_id, summary, outcome,
      attendees_present, attendees_absent, notes
    ) VALUES (
      v_trip_id, v_school_id, v_teacher,
      '[DEMO] 현대위아 견학 사후 보고 — 생산라인 투어와 Q&A가 유익했음.',
      '학생 만족도 높음. 다음 학기 재연계 검토.',
      1, 0,
      '안전교육 이수 확인 완료.'
    )
    ON CONFLICT (trip_id) DO UPDATE SET
      summary = EXCLUDED.summary,
      outcome = EXCLUDED.outcome,
      attendees_present = EXCLUDED.attendees_present,
      notes = EXCLUDED.notes,
      updated_at = CURRENT_TIMESTAMP;
  END IF;
END $$;

-- ── 7) Counseling sessions (예약) + journals (일지·타임라인) ──────────────────
DO $$
DECLARE
  v_school_id INTEGER;
  v_teacher   INTEGER;
  v_student   INTEGER;
  v_graduate  INTEGER;
  r RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'counseling_sessions') THEN
    RAISE NOTICE 'demo-seed: counseling_sessions missing — skip sessions';
  ELSE
    SELECT id INTO v_school_id FROM schools
    WHERE code = 'JJTH' OR name = '전주공업고등학교' ORDER BY id LIMIT 1;
    SELECT id INTO v_teacher FROM users WHERE email = 'teacher@jjob.com';
    SELECT id INTO v_student FROM users WHERE email = 'student@jjob.com';
    SELECT id INTO v_graduate FROM users WHERE email = 'graduate@jjob.com';

    -- Ensure teacher can appear in /counseling/teachers
    UPDATE users SET is_counselor = true WHERE id = v_teacher;

    FOR r IN
      SELECT * FROM (VALUES
        -- pending request (student)
        (v_student, v_teacher, '진로상담',
         (CURRENT_TIMESTAMP + INTERVAL '3 days')::timestamp,
         60, 'pending',
         '[DEMO] 스마트팩토리 진로 상담 예약',
         '희망 직무·자격증 로드맵 상담 요청'),
        -- approved upcoming
        (v_student, v_teacher, '취업상담',
         (CURRENT_TIMESTAMP + INTERVAL '7 days')::timestamp,
         60, 'approved',
         '[DEMO] 이력서·면접 클리닉',
         '대표 이력서 첨삭 및 모의면접'),
        -- scheduled (legacy status synonym for calendar)
        (v_student, v_teacher, '학습상담',
         (CURRENT_TIMESTAMP + INTERVAL '14 days')::timestamp,
         45, 'scheduled',
         '[DEMO] 정보처리기능사 학습 계획',
         '응시 일정·문제집 계획'),
        -- completed past (timeline)
        (v_student, v_teacher, '진로상담',
         (CURRENT_TIMESTAMP - INTERVAL '10 days')::timestamp,
         60, 'completed',
         '[DEMO] 1차 진로 탐색 상담(완료)',
         '관심 분야: 임베디드·스마트팩토리'),
        -- graduate session
        (v_graduate, v_teacher, '취업상담',
         (CURRENT_TIMESTAMP + INTERVAL '5 days')::timestamp,
         45, 'pending',
         '[DEMO] 후배 멘토링 연계 상담',
         '졸업생 멘토 활동·후배 상담 일정')
      ) AS t(user_id, counselor_id, session_type, session_date, duration_minutes, status, topic, notes)
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM counseling_sessions cs
        WHERE cs.counselor_id = r.counselor_id
          AND cs.user_id = r.user_id
          AND cs.topic = r.topic
      ) THEN
        INSERT INTO counseling_sessions (
          user_id, counselor_id, session_type, session_date, duration_minutes,
          status, topic, notes, school_id
        ) VALUES (
          r.user_id, r.counselor_id, r.session_type, r.session_date, r.duration_minutes,
          r.status, r.topic, r.notes, v_school_id
        );
      ELSE
        UPDATE counseling_sessions SET
          session_type = r.session_type,
          session_date = r.session_date,
          duration_minutes = r.duration_minutes,
          status = r.status,
          notes = r.notes,
          school_id = v_school_id,
          updated_at = CURRENT_TIMESTAMP
        WHERE counselor_id = r.counselor_id AND user_id = r.user_id AND topic = r.topic;
      END IF;
    END LOOP;
  END IF;
END $$;

DO $$
DECLARE
  v_school_id INTEGER;
  v_teacher   INTEGER;
  v_student   INTEGER;
  v_graduate  INTEGER;
  r RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'counseling_journals') THEN
    RETURN;
  END IF;

  SELECT id INTO v_school_id FROM schools
  WHERE code = 'JJTH' OR name = '전주공업고등학교' ORDER BY id LIMIT 1;
  SELECT id INTO v_teacher FROM users WHERE email = 'teacher@jjob.com';
  SELECT id INTO v_student FROM users WHERE email = 'student@jjob.com';
  SELECT id INTO v_graduate FROM users WHERE email = 'graduate@jjob.com';

  FOR r IN
    SELECT * FROM (VALUES
      (v_student, '김재학', '진로상담', CURRENT_DATE - 10,
       '[DEMO] 진로 상담 — 스마트팩토리',
       '스마트팩토리·임베디드 진로에 관심. 이력서·자격증 로드맵 안내.',
       '정보처리기능사 응시 권장, DEMO 채용 공고 지원 독려',
       '자격증 원서 마감 확인', CURRENT_DATE + 14),
      (v_student, '김재학', '취업상담', CURRENT_DATE - 3,
       '[DEMO] 취업 상담 — 이력서 첨삭',
       '대표 이력서 항목·키워드 정리. 스마트팩토리 공고 지원서 점검.',
       '지원서 제출 완료 확인, 면접 일정 공유',
       '모의면접 일정 잡기', CURRENT_DATE + 7),
      (v_student, '김재학', '학습상담', CURRENT_DATE - 1,
       '[DEMO] 학습 상담 — 기능사 대비',
       '정보처리기능사 필기 진도 점검. 주 3회 문제풀이 계획.',
       '문제집 대여 안내',
       NULL, NULL),
      (v_student, '김재학', '생활상담', CURRENT_DATE - 20,
       '[DEMO] 생활 상담 — 현장실습 적응',
       '현장실습 전 긴장감·출퇴근 루틴 상담. 보호자 연락 체계 안내.',
       '실습 담당 교사와 공유',
       NULL, NULL),
      (v_graduate, '이졸업', '취업상담', CURRENT_DATE - 5,
       '[DEMO] 졸업생 상담 — 멘토링 연계',
       '후배 멘토링 가능 일정·관심 분야(전자회로) 정리.',
       '밴드 취업후기 글과 연계 안내',
       '멘토 매칭 팔로업', CURRENT_DATE + 21)
    ) AS t(
      student_id, student_name, typ, counseling_date,
      title, content, action_taken, follow_up, follow_up_at
    )
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM counseling_journals
      WHERE teacher_id = v_teacher AND student_id = r.student_id AND title = r.title
    ) THEN
      INSERT INTO counseling_journals (
        teacher_id, teacher_name, student_id, student_name,
        counseling_date, type, title, content, action_taken, follow_up, follow_up_at, school_id
      ) VALUES (
        v_teacher, '박선생', r.student_id, r.student_name,
        r.counseling_date, r.typ, r.title, r.content, r.action_taken, r.follow_up, r.follow_up_at,
        v_school_id
      );
    ELSE
      UPDATE counseling_journals SET
        type = r.typ,
        content = r.content,
        action_taken = r.action_taken,
        follow_up = r.follow_up,
        follow_up_at = r.follow_up_at,
        counseling_date = r.counseling_date,
        school_id = v_school_id,
        teacher_name = '박선생',
        student_name = r.student_name,
        updated_at = CURRENT_TIMESTAMP
      WHERE teacher_id = v_teacher AND student_id = r.student_id AND title = r.title;
    END IF;
  END LOOP;
END $$;

-- ── Summary ──────────────────────────────────────────────────────────────────
SELECT '✅ demo-seed applied (idempotent)' AS message;

SELECT
  (SELECT COUNT(*) FROM resumes r JOIN users u ON u.id = r.user_id
     WHERE u.email IN ('student@jjob.com','graduate@jjob.com') AND r.title LIKE '[DEMO]%') AS demo_resumes,
  (SELECT COUNT(*) FROM posts WHERE title LIKE '[DEMO]%') AS demo_posts,
  (SELECT COUNT(*) FROM jobs WHERE title LIKE '[DEMO]%') AS demo_jobs,
  (SELECT COUNT(*) FROM announcements WHERE title LIKE '[DEMO]%') AS demo_announcements,
  (SELECT COUNT(*) FROM field_trips WHERE title LIKE '[DEMO]%') AS demo_field_trips,
  (SELECT COUNT(*) FROM education_programs WHERE title LIKE '[DEMO]%') AS demo_edu_programs,
  (SELECT COUNT(*) FROM counseling_sessions WHERE topic LIKE '[DEMO]%') AS demo_counseling_sessions,
  (SELECT COUNT(*) FROM counseling_journals WHERE title LIKE '[DEMO]%') AS demo_counseling_journals,
  (SELECT COALESCE(is_counselor, false) FROM users WHERE email = 'teacher@jjob.com') AS teacher_is_counselor,
  (SELECT logo_file_id IS NOT NULL AND primary_admin_user_id IS NOT NULL
     FROM schools WHERE code = 'JJTH' LIMIT 1) AS school_branding_ok;
