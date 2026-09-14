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

module.exports = {
  canonicalRole,
  isSystemAdmin,
  isSchoolAdmin,
  isStaffAdmin,
};
