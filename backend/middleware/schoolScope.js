const { isSystemAdmin } = require('../lib/roles');
const { sendError } = require('../lib/httpErrors');

function schoolScope(req, res, next) {
  if (!req.user) {
    return sendError(res, 401, 'UNAUTHENTICATED', 'Authentication required');
  }
  if (isSystemAdmin(req.user)) {
    req.scopedSchoolId = null;
  } else {
    req.scopedSchoolId = req.user.school_id ?? null;
  }
  next();
}

function assertSameSchool(req, resourceSchoolId) {
  if (isSystemAdmin(req.user)) return true;
  if (resourceSchoolId == null || req.user.school_id == null) return false;
  return Number(resourceSchoolId) === Number(req.user.school_id);
}

function forbidCrossSchool(res) {
  return sendError(res, 403, 'FORBIDDEN', '소속 학교 권한이 없습니다');
}

module.exports = {
  schoolScope,
  assertSameSchool,
  forbidCrossSchool,
};
