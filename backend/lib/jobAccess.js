const { canonicalRole, isSystemAdmin, isSchoolAdmin } = require('./roles');

function isCompanyUser(user) {
  return user && (canonicalRole(user) === 'company' || user.user_type === 'company');
}

function isTeacher(user) {
  return user && (canonicalRole(user) === 'teacher' || user.user_type === 'teacher');
}

function sameSchool(user, schoolId) {
  if (user == null || schoolId == null || user.school_id == null) return false;
  return Number(user.school_id) === Number(schoolId);
}

/**
 * Visibility: same-school only. Null-school jobs are NOT global.
 * system_admin sees all. Company owners see their own posts.
 */
function canSeeJob(user, job) {
  if (!job) return false;
  if (!user) return false;
  if (isSystemAdmin(user)) return true;
  if (Number(job.company_id) === Number(user.id)) return true;
  if (job.school_id == null) return false;
  return sameSchool(user, job.school_id);
}

function canManageJob(user, job) {
  if (!user || !job) return false;
  if (isSystemAdmin(user)) return true;
  if (Number(job.company_id) === Number(user.id)) return true;
  if ((isTeacher(user) || isSchoolAdmin(user)) && sameSchool(user, job.school_id)) return true;
  return false;
}

/**
 * List filter: never OR school_id IS NULL for school-scoped users.
 * Anonymous / no-school → empty (no global null-school exposure).
 */
function appendJobSchoolFilter(queryText, params, paramCount, user) {
  if (!user) {
    return { queryText: `${queryText} AND 1=0`, paramCount };
  }
  if (isSystemAdmin(user)) {
    return { queryText, paramCount };
  }
  if (isCompanyUser(user)) {
    paramCount += 1;
    queryText += ` AND (j.company_id = $${paramCount}`;
    params.push(user.id);
    if (user.school_id) {
      paramCount += 1;
      queryText += ` OR j.school_id = $${paramCount}`;
      params.push(user.school_id);
    }
    queryText += ')';
    return { queryText, paramCount };
  }
  if (user.school_id) {
    paramCount += 1;
    queryText += ` AND j.school_id = $${paramCount}`;
    params.push(user.school_id);
    return { queryText, paramCount };
  }
  return { queryText: `${queryText} AND 1=0`, paramCount };
}

module.exports = {
  isCompanyUser,
  isTeacher,
  sameSchool,
  canSeeJob,
  canManageJob,
  appendJobSchoolFilter,
};
