-- Policy decisions (2026-09-15 persona E2E Q1–Q7):
-- 1) Dedicated menu company_approval (configurable by system_admin via role_menu_permissions)
-- 5) Reverse 018 mass-bind of null-school companies to 전주공업고등학교
--    Policy: leave company school_id NULL until explicitly assigned (no fake Jeonju binding).
--    DX account company@jjob.com keeps explicit school (TEST-ACCOUNTS).
-- Idempotent.

-- ── company_approval menu ────────────────────────────────────
INSERT INTO menus (code, name, sort_order)
VALUES ('company_approval', '기업 승인', 25)
ON CONFLICT (code) DO NOTHING;

-- Default: system_admin + school_admin can approve (same as previous users.write gate)
INSERT INTO role_menu_permissions (role_id, menu_id, actions)
SELECT r.id, m.id, v.actions
FROM (VALUES
    ('system_admin', ARRAY['manage','write','read','apply']::text[]),
    ('school_admin', ARRAY['write','read','apply']::text[])
) AS v(role_code, actions)
JOIN roles r ON r.code = v.role_code
JOIN menus m ON m.code = 'company_approval'
ON CONFLICT (role_id, menu_id) DO UPDATE
SET actions = EXCLUDED.actions;

-- ── Reverse 018 §1 mass school bind to 전주공업고등학교 ───────
-- Prefer NULL until an admin or signup assigns a real school.
-- Keep documented DX test account.
UPDATE users u
SET school_id = NULL,
    updated_at = CURRENT_TIMESTAMP
FROM schools s
WHERE u.user_type = 'company'
  AND u.school_id = s.id
  AND s.name = '전주공업고등학교'
  AND u.is_active = true
  AND LOWER(u.email) <> 'company@jjob.com';

-- Clear company role school_id when user school was cleared
UPDATE user_roles ur
SET school_id = NULL
FROM users u, roles r
WHERE ur.user_id = u.id
  AND r.id = ur.role_id
  AND r.code = 'company'
  AND u.user_type = 'company'
  AND u.school_id IS NULL
  AND ur.school_id IS NOT NULL
  AND LOWER(u.email) <> 'company@jjob.com';

-- Ensure DX company@jjob.com still has a school when present (explicit, not mass-bind)
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
WHERE LOWER(u.email) = 'company@jjob.com'
  AND u.user_type = 'company'
  AND u.school_id IS NULL;
