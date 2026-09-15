-- Repair DX TEST-ACCOUNTS company row after REQ-JOB-007.
-- Idempotent.
--
-- Policy (2026-09-15): Do NOT mass-bind null-school companies to 전주공업고등학교.
-- Leave school_id NULL until explicitly assigned (signup or admin).
-- See migration 019 for undo of any prior mass-bind + company_approval menu.
-- This migration only ensures documented DX account company@jjob.com has an approved profile.

-- DX test account: ensure company_profiles exists and is approved (TEST-ACCOUNTS.md)
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

UPDATE company_profiles cp
SET approval_status = 'approved',
    approved_at = COALESCE(cp.approved_at, CURRENT_TIMESTAMP),
    company_name = COALESCE(NULLIF(cp.company_name, ''), 'JJOB채용'),
    updated_at = CURRENT_TIMESTAMP
FROM users u
WHERE cp.user_id = u.id
  AND u.email = 'company@jjob.com'
  AND COALESCE(cp.approval_status, 'pending') <> 'approved';

-- DX: explicit school assignment when still null (first active school — not Jeonju-forced)
UPDATE users u
SET school_id = s.id,
    school_name = COALESCE(NULLIF(u.school_name, ''), s.name),
    updated_at = CURRENT_TIMESTAMP
FROM (
  SELECT id, name FROM schools
  WHERE status = 'active'
  ORDER BY id
  LIMIT 1
) s
WHERE u.email = 'company@jjob.com'
  AND u.user_type = 'company'
  AND u.school_id IS NULL;

UPDATE user_roles ur
SET school_id = u.school_id
FROM users u, roles r
WHERE ur.user_id = u.id
  AND r.id = ur.role_id
  AND r.code = 'company'
  AND u.email = 'company@jjob.com'
  AND ur.school_id IS NULL
  AND u.school_id IS NOT NULL;
