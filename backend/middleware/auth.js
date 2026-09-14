const jwt = require('jsonwebtoken');
const { canonicalRole, isSystemAdmin } = require('../lib/roles');
const { sendError } = require('../lib/httpErrors');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return sendError(res, 401, 'UNAUTHENTICATED', 'Authentication required');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      ...decoded,
      role: decoded.role || canonicalRole(decoded),
      school_id: decoded.school_id ?? null,
    };
    next();
  } catch (error) {
    return sendError(res, 401, 'UNAUTHENTICATED', 'Invalid token');
  }
};

const checkRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 401, 'UNAUTHENTICATED', 'Authentication required');
    }

    const userRole = canonicalRole(req.user);
    const expanded = new Set();
    for (const role of roles) {
      if (role === 'admin' || role === 'system_admin') {
        expanded.add('admin');
        expanded.add('system_admin');
      } else {
        expanded.add(role);
      }
    }

    if (expanded.has(userRole) || expanded.has(req.user.user_type)) {
      return next();
    }

    return sendError(res, 403, 'FORBIDDEN', 'Access denied');
  };
};

module.exports = { auth, checkRole, isSystemAdmin };
