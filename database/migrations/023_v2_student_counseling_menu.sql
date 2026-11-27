-- 졸업생·재학생 진로상담 메뉴 (상담 신청 + 나의 상담일지 열람)
-- 2026-11-27. 관리자가 권한 매트릭스에서 이미 조정한 행은 건드리지 않는다.
INSERT INTO role_menu_permissions (role_id, menu_id, actions)
SELECT r.id, m.id, ARRAY['apply']
FROM roles r
JOIN menus m ON m.code = 'counseling'
WHERE r.code IN ('student', 'graduate')
ON CONFLICT (role_id, menu_id) DO NOTHING;
