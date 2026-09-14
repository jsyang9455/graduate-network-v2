const { sendError } = require('../lib/httpErrors');
const rbac = require('../modules/rbac');

function authorize(menu, action) {
  return async (req, res, next) => {
    if (!req.user) {
      return sendError(res, 401, 'UNAUTHENTICATED', 'Authentication required');
    }
    try {
      const allowed = await rbac.can(req.user, menu, action);
      if (!allowed) {
        return sendError(res, 403, 'FORBIDDEN', '소속 학교 권한이 없습니다');
      }
      next();
    } catch (err) {
      console.error('authorize error:', err);
      return sendError(res, 500, 'INTERNAL', 'Authorization failed');
    }
  };
}

module.exports = { authorize };
