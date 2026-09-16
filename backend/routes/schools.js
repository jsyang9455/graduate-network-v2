'use strict';

const express = require('express');
const multer = require('multer');
const bcrypt = require('bcrypt');
const router = express.Router();
const { query, getClient } = require('../config/database');
const { auth } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { schoolScope, assertSameSchool, forbidCrossSchool } = require('../middleware/schoolScope');
const { isSystemAdmin } = require('../lib/roles');
const { sendError } = require('../lib/httpErrors');
const { writeAudit, requestIp } = require('../modules/audit');
const { getStorage } = require('../modules/storage');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

const SCHOOL_LIST_COLS = `id, code, name, region, biz_no, status, logo_file_id, primary_admin_user_id, created_at, updated_at`;

function logoUrlFor(schoolId, logoFileId) {
  if (!logoFileId) return null;
  return `/api/schools/${schoolId}/logo`;
}

function mapSchool(row, extras = {}) {
  if (!row) return null;
  return {
    ...row,
    logo_url: logoUrlFor(row.id, row.logo_file_id),
    ...extras,
  };
}

async function attachPrimaryAdminRole(client, userId, schoolId) {
  const role = await client.query(`SELECT id FROM roles WHERE code = 'school_admin' LIMIT 1`);
  if (!role.rows.length) return;
  await client.query(
    `INSERT INTO user_roles (user_id, role_id, school_id)
     SELECT $1, $2, $3
     WHERE NOT EXISTS (
       SELECT 1 FROM user_roles
       WHERE user_id = $1 AND role_id = $2
         AND school_id IS NOT DISTINCT FROM $3
     )`,
    [userId, role.rows[0].id, schoolId]
  );
}

/**
 * Resolve or create primary school_admin inside an open transaction.
 * Body.primary_admin: { user_id } | { email, name, password, phone? }
 */
async function resolvePrimaryAdmin(client, schoolId, primaryAdmin, actorId) {
  if (!primaryAdmin || typeof primaryAdmin !== 'object') {
    const err = new Error('주 담당자(primary_admin)가 필요합니다');
    err.status = 400;
    err.code = 'VALIDATION';
    throw err;
  }

  if (primaryAdmin.user_id) {
    const uid = parseInt(primaryAdmin.user_id, 10);
    if (!Number.isFinite(uid)) {
      const err = new Error('primary_admin.user_id가 올바르지 않습니다');
      err.status = 400;
      err.code = 'VALIDATION';
      throw err;
    }
    const found = await client.query(
      `SELECT id, email, name, user_type, school_id, is_active FROM users WHERE id = $1`,
      [uid]
    );
    if (!found.rows.length || found.rows[0].is_active === false) {
      const err = new Error('주 담당자 사용자를 찾을 수 없습니다');
      err.status = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }
    const u = found.rows[0];
    if (u.school_id != null && Number(u.school_id) !== Number(schoolId)) {
      const err = new Error('주 담당자는 미배정 또는 동일 학교 사용자여야 합니다');
      err.status = 409;
      err.code = 'CONFLICT';
      throw err;
    }
    await client.query(
      `UPDATE users SET
         school_id = $1,
         school_name = (SELECT name FROM schools WHERE id = $1),
         user_type = 'school_admin',
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [schoolId, uid]
    );
    await attachPrimaryAdminRole(client, uid, schoolId);
    return { id: uid, email: u.email, name: u.name, user_type: 'school_admin' };
  }

  const email = String(primaryAdmin.email || '').trim().toLowerCase();
  const name = String(primaryAdmin.name || '').trim();
  const password = primaryAdmin.password;
  if (!email || !name || !password) {
    const err = new Error('주 담당자 email, name, password가 필요합니다');
    err.status = 400;
    err.code = 'VALIDATION';
    throw err;
  }
  if (String(password).length < 8) {
    const err = new Error('주 담당자 비밀번호는 최소 8자입니다');
    err.status = 400;
    err.code = 'VALIDATION';
    throw err;
  }

  const dup = await client.query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (dup.rows.length) {
    const err = new Error('이미 등록된 주 담당자 이메일입니다');
    err.status = 409;
    err.code = 'CONFLICT';
    throw err;
  }

  const password_hash = await bcrypt.hash(String(password), 10);
  const schoolName = (
    await client.query(`SELECT name FROM schools WHERE id = $1`, [schoolId])
  ).rows[0]?.name;
  const phone = primaryAdmin.phone ? String(primaryAdmin.phone).trim() : null;

  const cols = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users'`
  );
  const colSet = new Set(cols.rows.map((r) => r.column_name));

  let insertSql;
  let params;
  if (colSet.has('phone') && colSet.has('school_name')) {
    insertSql = `INSERT INTO users (email, password_hash, name, user_type, school_id, school_name, phone, is_active)
                 VALUES ($1,$2,$3,'school_admin',$4,$5,$6,true) RETURNING id, email, name, user_type`;
    params = [email, password_hash, name, schoolId, schoolName || null, phone];
  } else if (colSet.has('school_name')) {
    insertSql = `INSERT INTO users (email, password_hash, name, user_type, school_id, school_name, is_active)
                 VALUES ($1,$2,$3,'school_admin',$4,$5,true) RETURNING id, email, name, user_type`;
    params = [email, password_hash, name, schoolId, schoolName || null];
  } else {
    insertSql = `INSERT INTO users (email, password_hash, name, user_type, school_id, is_active)
                 VALUES ($1,$2,$3,'school_admin',$4,true) RETURNING id, email, name, user_type`;
    params = [email, password_hash, name, schoolId];
  }

  const created = await client.query(insertSql, params);
  const admin = created.rows[0];
  await attachPrimaryAdminRole(client, admin.id, schoolId);
  return admin;
}

async function loadPrimaryAdminSummary(schoolId, primaryAdminUserId) {
  if (!primaryAdminUserId) return null;
  const r = await query(
    `SELECT id, email, name, user_type FROM users WHERE id = $1`,
    [primaryAdminUserId]
  );
  return r.rows[0] || null;
}

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
    let sql = `SELECT ${SCHOOL_LIST_COLS} FROM schools`;
    if (!includeInactive) {
      sql += ` WHERE status = 'active'`;
    }
    sql += ` ORDER BY name ASC`;
    const result = await query(sql);
    res.json({ schools: result.rows.map((row) => mapSchool(row)) });
  } catch (error) {
    console.error('List schools error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to list schools');
  }
});

router.post('/', auth, authorize('schools', 'manage'), async (req, res) => {
  const client = await getClient();
  try {
    const { name, region, biz_no, code, status, primary_admin: primaryAdmin } = req.body || {};
    if (!name || !String(name).trim()) {
      return sendError(res, 400, 'VALIDATION', '학교명이 필요합니다');
    }
    if (!primaryAdmin) {
      return sendError(res, 400, 'VALIDATION', '주 담당자(primary_admin)가 필요합니다');
    }

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO schools (code, name, region, biz_no, status)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'active'))
       RETURNING ${SCHOOL_LIST_COLS}`,
      [code || null, String(name).trim(), region || null, biz_no || null, status || 'active']
    );
    let school = result.rows[0];

    const admin = await resolvePrimaryAdmin(client, school.id, primaryAdmin, req.user.id);

    const updated = await client.query(
      `UPDATE schools SET primary_admin_user_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING ${SCHOOL_LIST_COLS}`,
      [admin.id, school.id]
    );
    school = updated.rows[0];

    await client.query('COMMIT');

    await writeAudit({
      actorId: req.user.id,
      schoolId: school.id,
      action: 'school.create',
      resource: `schools:${school.id}`,
      payload: { name: school.name, primary_admin_user_id: admin.id },
      ip: requestIp(req),
    });

    res.status(201).json({
      school: mapSchool(school),
      primary_admin: admin,
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore */
    }
    if (error.status && error.code) {
      return sendError(res, error.status, error.code, error.message);
    }
    if (error.code === '23505') {
      return sendError(res, 409, 'CONFLICT', '이미 등록된 학교입니다');
    }
    console.error('Create school error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to create school');
  } finally {
    client.release();
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

// Public logo stream for <img src> (school branding)
router.get('/:id/logo', async (req, res) => {
  try {
    const schoolId = parseInt(req.params.id, 10);
    const school = await query(
      `SELECT id, logo_file_id FROM schools WHERE id = $1`,
      [schoolId]
    );
    if (!school.rows.length || !school.rows[0].logo_file_id) {
      return sendError(res, 404, 'NOT_FOUND', '학교 로고가 없습니다');
    }
    const file = await query(`SELECT * FROM files WHERE id = $1 AND kind = 'school_logo'`, [
      school.rows[0].logo_file_id,
    ]);
    if (!file.rows.length) {
      return sendError(res, 404, 'NOT_FOUND', '학교 로고 파일을 찾을 수 없습니다');
    }
    const meta = file.rows[0];
    const buffer = await getStorage().get(meta.bucket_key);
    res.setHeader('Content-Type', meta.mime || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return sendError(res, 404, 'NOT_FOUND', '저장된 로고를 찾을 수 없습니다');
    }
    console.error('Get school logo error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to get school logo');
  }
});

router.post(
  '/:id/logo',
  auth,
  authorize('schools', 'write'),
  schoolScope,
  upload.single('file'),
  async (req, res) => {
    try {
      const schoolId = parseInt(req.params.id, 10);
      if (!isSystemAdmin(req.user) && !assertSameSchool(req, schoolId)) {
        return forbidCrossSchool(res);
      }
      if (!req.file) {
        return sendError(res, 400, 'VALIDATION', 'file required (multipart field "file")');
      }
      const mime = req.file.mimetype || 'application/octet-stream';
      if (!String(mime).startsWith('image/')) {
        return sendError(res, 400, 'VALIDATION', '이미지 파일만 업로드할 수 있습니다');
      }

      const existing = await query(`SELECT id FROM schools WHERE id = $1`, [schoolId]);
      if (!existing.rows.length) {
        return sendError(res, 404, 'NOT_FOUND', '학교를 찾을 수 없습니다');
      }

      const originalName = req.file.originalname || 'school-logo';
      const stored = await getStorage().put({
        buffer: req.file.buffer,
        mime,
        kind: 'school_logo',
        schoolId,
        originalName,
      });

      const fileIns = await query(
        `INSERT INTO files (school_id, owner_user_id, bucket_key, mime, size, kind, original_name)
         VALUES ($1, $2, $3, $4, $5, 'school_logo', $6)
         RETURNING id, school_id, mime, size, kind, original_name, created_at`,
        [schoolId, req.user.id, stored.bucketKey, mime, stored.size, originalName]
      );
      const file = fileIns.rows[0];

      const schoolUp = await query(
        `UPDATE schools SET logo_file_id = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING ${SCHOOL_LIST_COLS}`,
        [file.id, schoolId]
      );

      await writeAudit({
        actorId: req.user.id,
        schoolId,
        action: 'school.logo.upload',
        resource: `schools:${schoolId}`,
        payload: { logo_file_id: file.id },
        ip: requestIp(req),
      });

      res.status(201).json({
        school: mapSchool(schoolUp.rows[0]),
        file,
      });
    } catch (error) {
      console.error('Upload school logo error:', error);
      if (error.code === 'NOT_CONFIGURED') {
        return sendError(res, 503, 'NOT_CONFIGURED', error.message);
      }
      return sendError(res, 500, 'INTERNAL', 'Failed to upload school logo');
    }
  }
);

router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT ${SCHOOL_LIST_COLS} FROM schools WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return sendError(res, 404, 'NOT_FOUND', '학교를 찾을 수 없습니다');
    }
    const school = result.rows[0];
    const primary_admin = await loadPrimaryAdminSummary(school.id, school.primary_admin_user_id);
    res.json({
      school: mapSchool(school, {
        primary_admin_name: primary_admin?.name || null,
        primary_admin_email: primary_admin?.email || null,
      }),
      primary_admin,
    });
  } catch (error) {
    console.error('Get school error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to get school');
  }
});

router.patch('/:id', auth, authorize('schools', 'write'), schoolScope, async (req, res) => {
  const client = await getClient();
  try {
    const schoolId = parseInt(req.params.id, 10);
    if (!isSystemAdmin(req.user) && !assertSameSchool(req, schoolId)) {
      return forbidCrossSchool(res);
    }

    await client.query('BEGIN');

    const existing = await client.query(`SELECT * FROM schools WHERE id = $1`, [schoolId]);
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return sendError(res, 404, 'NOT_FOUND', '학교를 찾을 수 없습니다');
    }

    const { name, region, biz_no, code, status, logo_file_id, primary_admin: primaryAdmin } = req.body || {};
    if (status === 'inactive' && !isSystemAdmin(req.user)) {
      await client.query('ROLLBACK');
      return sendError(res, 403, 'FORBIDDEN', '학교 비활성화는 시스템 관리자만 가능합니다');
    }

    let primaryAdminUserId = existing.rows[0].primary_admin_user_id;
    let adminSummary = null;
    if (primaryAdmin) {
      adminSummary = await resolvePrimaryAdmin(client, schoolId, primaryAdmin, req.user.id);
      primaryAdminUserId = adminSummary.id;
    }

    const result = await client.query(
      `UPDATE schools SET
         name = COALESCE($1, name),
         region = COALESCE($2, region),
         biz_no = COALESCE($3, biz_no),
         code = COALESCE($4, code),
         status = COALESCE($5, status),
         logo_file_id = COALESCE($6, logo_file_id),
         primary_admin_user_id = COALESCE($7, primary_admin_user_id),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING ${SCHOOL_LIST_COLS}`,
      [
        name || null,
        region || null,
        biz_no || null,
        code || null,
        status || null,
        logo_file_id != null ? logo_file_id : null,
        primaryAdminUserId,
        schoolId,
      ]
    );

    await client.query('COMMIT');

    await writeAudit({
      actorId: req.user.id,
      schoolId,
      action: 'school.update',
      resource: `schools:${schoolId}`,
      payload: { name, region, status, primary_admin_user_id: primaryAdminUserId },
      ip: requestIp(req),
    });

    const school = result.rows[0];
    const primary_admin =
      adminSummary || (await loadPrimaryAdminSummary(schoolId, school.primary_admin_user_id));
    res.json({ school: mapSchool(school), primary_admin });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore */
    }
    if (error.status && error.code) {
      return sendError(res, error.status, error.code, error.message);
    }
    if (error.code === '23505') {
      return sendError(res, 409, 'CONFLICT', '이미 등록된 학교 코드/이름입니다');
    }
    console.error('Update school error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to update school');
  } finally {
    client.release();
  }
});

module.exports = router;
