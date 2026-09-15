const express = require('express');
const { query } = require('../config/database');
const { auth } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { sendError } = require('../lib/httpErrors');
const { isSystemAdmin } = require('../lib/roles');
const rbac = require('../modules/rbac');
const { writeAudit, requestIp } = require('../modules/audit');

const router = express.Router();

const ALLOWED_ACTIONS = new Set(['manage', 'write', 'read', 'apply']);

function normalizeActions(actions) {
  if (!Array.isArray(actions)) return null;
  const cleaned = [...new Set(actions.map((a) => String(a).trim()).filter((a) => ALLOWED_ACTIONS.has(a)))];
  return cleaned;
}

// GET /api/roles — list roles (+ optional menu summary)
router.get('/', auth, authorize('schools', 'manage'), async (req, res) => {
  try {
    if (!isSystemAdmin(req.user)) {
      return sendError(res, 403, 'FORBIDDEN', '시스템 관리자만 역할 권한을 조회할 수 있습니다');
    }
    const roles = await query('SELECT id, code, name FROM roles ORDER BY id');
    const perms = await query(
      `SELECT r.code AS role_code, m.code AS menu_code, rmp.actions
       FROM role_menu_permissions rmp
       JOIN roles r ON r.id = rmp.role_id
       JOIN menus m ON m.id = rmp.menu_id
       ORDER BY r.code, m.code`
    );
    const byRole = {};
    for (const row of perms.rows) {
      if (!byRole[row.role_code]) byRole[row.role_code] = {};
      byRole[row.role_code][row.menu_code] = row.actions || [];
    }
    res.json({
      roles: roles.rows.map((r) => ({
        ...r,
        permissions: byRole[r.code] || {},
      })),
    });
  } catch (error) {
    console.error('List roles error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to list roles');
  }
});

// GET /api/roles/:code/permissions
router.get('/:code/permissions', auth, authorize('schools', 'manage'), async (req, res) => {
  try {
    if (!isSystemAdmin(req.user)) {
      return sendError(res, 403, 'FORBIDDEN', '시스템 관리자만 역할 권한을 조회할 수 있습니다');
    }
    const code = String(req.params.code || '').trim();
    const role = await query('SELECT id, code, name FROM roles WHERE code = $1', [code]);
    if (!role.rows.length) {
      return sendError(res, 404, 'NOT_FOUND', 'Role not found');
    }
    const perms = await query(
      `SELECT m.code AS menu_code, m.name AS menu_name, COALESCE(rmp.actions, '{}') AS actions
       FROM menus m
       LEFT JOIN role_menu_permissions rmp
         ON rmp.menu_id = m.id AND rmp.role_id = $1
       ORDER BY m.sort_order, m.id`,
      [role.rows[0].id]
    );
    const permissions = {};
    for (const row of perms.rows) {
      permissions[row.menu_code] = row.actions || [];
    }
    res.json({ role: role.rows[0], permissions, menus: perms.rows });
  } catch (error) {
    console.error('Get role permissions error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to get role permissions');
  }
});

/**
 * PUT /api/roles/:code/permissions
 * Body: { permissions: { menu_code: ['read','write',...] , ... } }
 * Merges provided menus; omit menus to leave unchanged.
 * Empty array removes that menu permission.
 */
router.put('/:code/permissions', auth, authorize('schools', 'manage'), async (req, res) => {
  try {
    if (!isSystemAdmin(req.user)) {
      return sendError(res, 403, 'FORBIDDEN', '시스템 관리자만 역할 권한을 변경할 수 있습니다');
    }
    const code = String(req.params.code || '').trim();
    if (code === 'system_admin') {
      return sendError(res, 400, 'VALIDATION', 'system_admin 권한 매트릭스는 변경할 수 없습니다');
    }

    const incoming = req.body?.permissions || req.body?.menus;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      return sendError(res, 400, 'VALIDATION', 'permissions object is required');
    }

    const role = await query('SELECT id, code, name FROM roles WHERE code = $1', [code]);
    if (!role.rows.length) {
      return sendError(res, 404, 'NOT_FOUND', 'Role not found');
    }
    const roleId = role.rows[0].id;

    const updates = [];
    for (const [menuCode, actionsRaw] of Object.entries(incoming)) {
      const actions = normalizeActions(actionsRaw);
      if (actions == null) {
        return sendError(res, 400, 'VALIDATION', `Invalid actions for menu ${menuCode}`);
      }
      const menu = await query('SELECT id, code FROM menus WHERE code = $1', [menuCode]);
      if (!menu.rows.length) {
        return sendError(res, 400, 'VALIDATION', `Unknown menu: ${menuCode}`);
      }
      updates.push({ menuId: menu.rows[0].id, menuCode, actions });
    }

    for (const u of updates) {
      if (u.actions.length === 0) {
        await query(
          'DELETE FROM role_menu_permissions WHERE role_id = $1 AND menu_id = $2',
          [roleId, u.menuId]
        );
      } else {
        await query(
          `INSERT INTO role_menu_permissions (role_id, menu_id, actions)
           VALUES ($1, $2, $3)
           ON CONFLICT (role_id, menu_id) DO UPDATE SET actions = EXCLUDED.actions`,
          [roleId, u.menuId, u.actions]
        );
      }
    }

    rbac.invalidate();

    await writeAudit({
      actorId: req.user.id,
      schoolId: req.user.school_id,
      action: 'role.permissions.update',
      resource: `roles:${code}`,
      payload: { permissions: incoming },
      ip: requestIp(req),
    });

    const perms = await query(
      `SELECT m.code AS menu_code, COALESCE(rmp.actions, '{}') AS actions
       FROM menus m
       LEFT JOIN role_menu_permissions rmp
         ON rmp.menu_id = m.id AND rmp.role_id = $1`,
      [roleId]
    );
    const permissions = {};
    for (const row of perms.rows) {
      permissions[row.menu_code] = row.actions || [];
    }

    res.json({
      message: '권한이 저장되었습니다',
      role: role.rows[0],
      permissions,
    });
  } catch (error) {
    console.error('Update role permissions error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to update role permissions');
  }
});

module.exports = router;
