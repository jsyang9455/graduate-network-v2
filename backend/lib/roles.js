function canonicalRole(user) {
  if (!user) return null;
  if (user.role) return user.role;
  const t = user.user_type;
  if (t === 'admin' || t === 'system_admin') return 'system_admin';
  return t || null;
}

function isSystemAdmin(user) {
  const role = canonicalRole(user);
  return role === 'system_admin' || user?.user_type === 'admin' || user?.user_type === 'system_admin';
}

function isSchoolAdmin(user) {
  return canonicalRole(user) === 'school_admin' || user?.user_type === 'school_admin';
}

function isStaffAdmin(user) {
  return isSystemAdmin(user) || isSchoolAdmin(user);
}

/** UI / API display label. v1 `admin` → 시스템 관리자 (system_admin). */
function displayRoleLabel(userOrType) {
  const raw = typeof userOrType === 'string'
    ? userOrType
    : (canonicalRole(userOrType) || userOrType?.user_type || '');
  const map = {
    system_admin: '시스템 관리자',
    admin: '시스템 관리자',
    school_admin: '학교 관리자',
    teacher: '교사',
    student: '학생',
    graduate: '졸업생',
    company: '기업',
  };
  return map[raw] || raw || '';
}

/** CSS badge suffix: admin → system_admin for consistent styling */
function displayRoleBadgeKey(userOrType) {
  const raw = typeof userOrType === 'string'
    ? userOrType
    : (userOrType?.user_type || canonicalRole(userOrType) || '');
  if (raw === 'admin' || raw === 'system_admin') return 'system_admin';
  return raw || 'unknown';
}

module.exports = {
  canonicalRole,
  isSystemAdmin,
  isSchoolAdmin,
  isStaffAdmin,
  displayRoleLabel,
  displayRoleBadgeKey,
};
