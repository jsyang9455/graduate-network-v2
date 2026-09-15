/**
 * Role display labels — v1 `admin` → 시스템 관리자 / system_admin.
 * Keep in sync with backend/lib/roles.js displayRoleLabel.
 */
(function (global) {
  const LABELS = {
    system_admin: '시스템 관리자',
    admin: '시스템 관리자',
    school_admin: '학교 관리자',
    teacher: '교사',
    student: '학생',
    graduate: '졸업생',
    company: '기업',
  };

  function canonicalRoleCode(userOrType) {
    if (!userOrType) return '';
    if (typeof userOrType === 'string') {
      if (userOrType === 'admin') return 'system_admin';
      return userOrType;
    }
    if (userOrType.role === 'system_admin' || userOrType.user_type === 'admin'
      || userOrType.user_type === 'system_admin') {
      return 'system_admin';
    }
    return userOrType.role || userOrType.user_type || '';
  }

  function displayRoleLabel(userOrType) {
    const raw = typeof userOrType === 'string'
      ? userOrType
      : (canonicalRoleCode(userOrType) || userOrType?.user_type || '');
    return LABELS[raw] || raw || '';
  }

  function displayRoleBadgeKey(userOrType) {
    const raw = typeof userOrType === 'string'
      ? userOrType
      : (userOrType?.user_type || canonicalRoleCode(userOrType) || '');
    if (raw === 'admin' || raw === 'system_admin') return 'system_admin';
    return raw || 'unknown';
  }

  global.RoleLabels = {
    LABELS,
    canonicalRoleCode,
    displayRoleLabel,
    displayRoleBadgeKey,
  };
})(typeof window !== 'undefined' ? window : globalThis);
