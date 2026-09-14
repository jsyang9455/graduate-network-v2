const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { auth } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { schoolScope, assertSameSchool, forbidCrossSchool } = require('../middleware/schoolScope');
const { isSystemAdmin } = require('../lib/roles');
const { sendError } = require('../lib/httpErrors');
const { writeAudit, requestIp } = require('../modules/audit');

// Public list of active schools (signup). Admins may request include_inactive.
router.get('/', async (req, res) => {
  try {
    const includeInactive = req.query.include_inactive === 'true' || req.query.include_inactive === '1';
    if (includeInactive) {
      const token = req.header('Authorization')?.replace('Bearer ', '');
      if (!token) {
        return sendError(res, 401, 'UNAUTHENTICATED', 'Authentication required');
      }
    }
    let sql = `SELECT id, code, name, region, biz_no, status, created_at, updated_at FROM schools`;
    const params = [];
    if (!includeInactive) {
      sql += ` WHERE status = 'active'`;
    }
    sql += ` ORDER BY name ASC`;
    const result = await query(sql, params);
    res.json({ schools: result.rows });
  } catch (error) {
    console.error('List schools error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to list schools');
  }
});

router.post('/', auth, authorize('schools', 'manage'), async (req, res) => {
  try {
    const { name, region, biz_no, code, status } = req.body;
    if (!name || !String(name).trim()) {
      return sendError(res, 400, 'VALIDATION', '학교명이 필요합니다');
    }
    const result = await query(
      `INSERT INTO schools (code, name, region, biz_no, status)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'active'))
       RETURNING *`,
      [code || null, String(name).trim(), region || null, biz_no || null, status || 'active']
    );
    const school = result.rows[0];
    await writeAudit({
      actorId: req.user.id,
      schoolId: school.id,
      action: 'school.create',
      resource: `schools:${school.id}`,
      payload: { name: school.name },
      ip: requestIp(req),
    });
    res.status(201).json({ school });
  } catch (error) {
    if (error.code === '23505') {
      return sendError(res, 409, 'CONFLICT', '이미 등록된 학교입니다');
    }
    console.error('Create school error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to create school');
  }
});

router.get('/:id/departments', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, school_id, name, is_active, created_at, updated_at
       FROM departments
       WHERE school_id = $1 AND is_active = true
       ORDER BY name ASC`,
      [req.params.id]
    );
    res.json({ departments: result.rows });
  } catch (error) {
    console.error('List departments error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to list departments');
  }
});

router.post('/:id/departments', auth, authorize('schools', 'write'), schoolScope, async (req, res) => {
  try {
    const schoolId = parseInt(req.params.id, 10);
    if (!assertSameSchool(req, schoolId) && !isSystemAdmin(req.user)) {
      return forbidCrossSchool(res);
    }
    const { name } = req.body;
    if (!name || !String(name).trim()) {
      return sendError(res, 400, 'VALIDATION', '학과명이 필요합니다');
    }
    const result = await query(
      `INSERT INTO departments (school_id, name) VALUES ($1, $2) RETURNING *`,
      [schoolId, String(name).trim()]
    );
    res.status(201).json({ department: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return sendError(res, 409, 'CONFLICT', '이미 등록된 학과입니다');
    }
    console.error('Create department error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to create department');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, code, name, region, biz_no, status, created_at, updated_at
       FROM schools WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return sendError(res, 404, 'NOT_FOUND', '학교를 찾을 수 없습니다');
    }
    res.json({ school: result.rows[0] });
  } catch (error) {
    console.error('Get school error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to get school');
  }
});

router.patch('/:id', auth, authorize('schools', 'write'), schoolScope, async (req, res) => {
  try {
    const schoolId = parseInt(req.params.id, 10);
    if (!isSystemAdmin(req.user) && !assertSameSchool(req, schoolId)) {
      return forbidCrossSchool(res);
    }

    const existing = await query('SELECT * FROM schools WHERE id = $1', [schoolId]);
    if (existing.rows.length === 0) {
      return sendError(res, 404, 'NOT_FOUND', '학교를 찾을 수 없습니다');
    }

    const { name, region, biz_no, code, status } = req.body;
    if (status === 'inactive' && !isSystemAdmin(req.user)) {
      return sendError(res, 403, 'FORBIDDEN', '학교 비활성화는 시스템 관리자만 가능합니다');
    }

    const result = await query(
      `UPDATE schools SET
         name = COALESCE($1, name),
         region = COALESCE($2, region),
         biz_no = COALESCE($3, biz_no),
         code = COALESCE($4, code),
         status = COALESCE($5, status),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [name || null, region || null, biz_no || null, code || null, status || null, schoolId]
    );

    await writeAudit({
      actorId: req.user.id,
      schoolId,
      action: 'school.update',
      resource: `schools:${schoolId}`,
      payload: { name, region, status },
      ip: requestIp(req),
    });

    res.json({ school: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return sendError(res, 409, 'CONFLICT', '이미 등록된 학교 코드/이름입니다');
    }
    console.error('Update school error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to update school');
  }
});

module.exports = router;
