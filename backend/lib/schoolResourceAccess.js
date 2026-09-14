const { isSystemAdmin } = require('./roles');
const { sendError } = require('./httpErrors');
const { forbidCrossSchool } = require('../middleware/schoolScope');

function sameSchool(user, schoolId) {
  if (user == null || schoolId == null || user.school_id == null) return false;
  return Number(user.school_id) === Number(schoolId);
}

function canSeeSchoolResource(user, resourceSchoolId) {
  if (resourceSchoolId == null) return true;
  if (!user) return false;
  if (isSystemAdmin(user)) return true;
  return sameSchool(user, resourceSchoolId);
}

function appendSchoolColumnFilter(queryText, params, paramCount, user, columnRef) {
  if (!user) {
    return { queryText: `${queryText} AND ${columnRef} IS NULL`, paramCount };
  }
  if (isSystemAdmin(user)) {
    return { queryText, paramCount };
  }
  if (user.school_id) {
    paramCount += 1;
    queryText += ` AND (${columnRef} = $${paramCount} OR ${columnRef} IS NULL)`;
    params.push(user.school_id);
    return { queryText, paramCount };
  }
  return { queryText: `${queryText} AND ${columnRef} IS NULL`, paramCount };
}

function denySchoolResourceAccess(res, user) {
  if (!user) {
    return sendError(res, 401, 'UNAUTHENTICATED', 'Authentication required');
  }
  return forbidCrossSchool(res);
}

module.exports = {
  sameSchool,
  canSeeSchoolResource,
  appendSchoolColumnFilter,
  denySchoolResourceAccess,
};
