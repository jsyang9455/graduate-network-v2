const { query } = require('../../config/database');
const { canonicalRole } = require('../../lib/roles');

const CACHE_TTL_MS = 60 * 1000;
let cache = { at: 0, byRole: new Map() };

function expandActions(highest) {
  const order = ['apply', 'read', 'write', 'manage'];
  const idx = order.indexOf(highest);
  if (idx < 0) return [];
  return order.slice(0, idx + 1);
}

const LEGACY_MATRIX = {
  system_admin: {
    schools: ['manage', 'write', 'read', 'apply'],
    users: ['manage', 'write', 'read', 'apply'],
    resumes: ['read'],
    counseling: ['read'],
    jobs: ['manage', 'write', 'read', 'apply'],
    applications: ['read'],
    recommendations: ['read'],
    field_trips: ['manage', 'write', 'read', 'apply'],
    community: ['manage', 'write', 'read', 'apply'],
    messages: ['manage', 'write', 'read', 'apply'],
    stats: ['manage', 'write', 'read', 'apply'],
  },
  school_admin: {
    schools: ['write', 'read', 'apply'],
    users: ['write', 'read', 'apply'],
    resumes: ['read'],
    counseling: ['manage', 'write', 'read', 'apply'],
    jobs: ['write', 'read', 'apply'],
    applications: ['read'],
    recommendations: ['read'],
    field_trips: ['write', 'read', 'apply'],
    community: ['manage', 'write', 'read', 'apply'],
    messages: ['write', 'read', 'apply'],
    stats: ['read'],
  },
  teacher: {
    users: ['read'],
    resumes: ['read'],
    counseling: ['write', 'read', 'apply'],
    jobs: ['write', 'read', 'apply'],
    applications: ['read'],
    recommendations: ['read'],
    field_trips: ['write', 'read', 'apply'],
    community: ['write', 'read', 'apply'],
    stats: ['read'],
  },
  student: {
    resumes: ['write', 'read', 'apply'],
    jobs: ['read'],
    applications: ['write', 'read', 'apply'],
    recommendations: ['read'],
    field_trips: ['apply'],
    community: ['write', 'read', 'apply'],
  },
  graduate: {
    resumes: ['write', 'read', 'apply'],
    jobs: ['read'],
    applications: ['write', 'read', 'apply'],
    recommendations: ['read'],
    field_trips: ['apply'],
    community: ['write', 'read', 'apply'],
  },
  company: {
    resumes: ['read'],
    jobs: ['write', 'read', 'apply'],
    applications: ['write', 'read', 'apply'],
  },
};

function invalidate() {
  cache = { at: 0, byRole: new Map() };
}

async function loadFromDb() {
  const result = await query(
    `SELECT r.code AS role_code, m.code AS menu_code, rmp.actions
     FROM role_menu_permissions rmp
     JOIN roles r ON r.id = rmp.role_id
     JOIN menus m ON m.id = rmp.menu_id`
  );
  const byRole = new Map();
  for (const row of result.rows) {
    if (!byRole.has(row.role_code)) byRole.set(row.role_code, {});
    byRole.get(row.role_code)[row.menu_code] = row.actions || [];
  }
  cache = { at: Date.now(), byRole };
  return byRole;
}

async function matrixForRole(roleCode) {
  try {
    if (Date.now() - cache.at > CACHE_TTL_MS) {
      await loadFromDb();
    }
    return cache.byRole.get(roleCode) || {};
  } catch (err) {
    if (err.code === '42P01') {
      return LEGACY_MATRIX[roleCode] || {};
    }
    throw err;
  }
}

async function can(user, menu, action) {
  const role = canonicalRole(user);
  if (!role) return false;
  const matrix = await matrixForRole(role);
  const actions = matrix[menu] || [];
  return actions.includes(action);
}

async function permissionsFor(user) {
  const role = canonicalRole(user);
  const matrix = await matrixForRole(role);
  const menus = Object.entries(matrix).map(([code, actions]) => ({ code, actions }));
  return {
    role,
    school_id: user.school_id ?? null,
    user_type: user.user_type,
    menus,
  };
}

module.exports = {
  can,
  permissionsFor,
  invalidate,
  expandActions,
  LEGACY_MATRIX,
};
