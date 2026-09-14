const jwt = require('jsonwebtoken');
const { canonicalRole, isSystemAdmin } = require('../lib/roles');
const { sendError } = require('../lib/httpErrors');

function attachUserFromToken(decoded) {
  return {
    ...decoded,
    role: decoded.role || canonicalRole(decoded),
    school_id: decoded.school_id ?? null,
  };
}

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return sendError(res, 401, 'UNAUTHENTICATED', 'Authentication required');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = attachUserFromToken(decoded);
    next();
  } catch (error) {
    return sendError(res, 401, 'UNAUTHENTICATED', 'Invalid token');
  }
};

const optionalAuth = async (req, res, next) => {
  const header = req.header('Authorization');
  const token = header ? header.replace('Bearer ', '') : '';
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = attachUserFromToken(decoded);
    return next();
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

module.exports = { auth, optionalAuth, checkRole, isSystemAdmin };
