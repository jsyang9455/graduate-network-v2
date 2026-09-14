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

function canSeeJob(user, job) {
  if (!job) return false;
  if (!user) return job.school_id == null;
  if (isSystemAdmin(user)) return true;
  if (Number(job.company_id) === Number(user.id)) return true;
  if (job.school_id == null) return true;
  return sameSchool(user, job.school_id);
}

function canManageJob(user, job) {
  if (!user || !job) return false;
  if (isSystemAdmin(user)) return true;
  if (Number(job.company_id) === Number(user.id)) return true;
  if ((isTeacher(user) || isSchoolAdmin(user)) && sameSchool(user, job.school_id)) return true;
  return false;
}

function appendJobSchoolFilter(queryText, params, paramCount, user) {
  if (!user) {
    return { queryText: `${queryText} AND j.school_id IS NULL`, paramCount };
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
    queryText += ` AND (j.school_id = $${paramCount} OR j.school_id IS NULL)`;
    params.push(user.school_id);
    return { queryText, paramCount };
  }
  return { queryText: `${queryText} AND j.school_id IS NULL`, paramCount };
}

module.exports = {
  isCompanyUser,
  isTeacher,
  sameSchool,
  canSeeJob,
  canManageJob,
  appendJobSchoolFilter,
};
