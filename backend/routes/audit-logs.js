const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { auth } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { schoolScope } = require('../middleware/schoolScope');
const { isSystemAdmin } = require('../lib/roles');
const { sendError } = require('../lib/httpErrors');

router.get('/', auth, authorize('schools', 'read'), schoolScope, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const params = [];
    let where = 'WHERE 1=1';
    if (!isSystemAdmin(req.user)) {
      if (!req.user.school_id) {
        return res.json({ logs: [], pagination: { page: 1, limit: parseInt(limit, 10), total: 0 } });
      }
      params.push(req.user.school_id);
      where += ` AND school_id = $${params.length}`;
    }

    const count = await query(`SELECT COUNT(*) FROM audit_logs ${where}`, params);
    params.push(parseInt(limit, 10), offset);
    const result = await query(
      `SELECT id, actor_id, school_id, action, resource, payload, ip, created_at
       FROM audit_logs ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      logs: result.rows,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: parseInt(count.rows[0].count, 10),
      },
    });
  } catch (error) {
    console.error('List audit logs error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to list audit logs');
  }
});

module.exports = router;
