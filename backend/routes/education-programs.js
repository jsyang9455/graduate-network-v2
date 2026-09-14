const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { auth, checkRole, optionalAuth } = require('../middleware/auth');
const { forbidCrossSchool } = require('../middleware/schoolScope');
const { isSystemAdmin } = require('../lib/roles');
const {
  canSeeSchoolResource,
  appendSchoolColumnFilter,
  denySchoolResourceAccess,
} = require('../lib/schoolResourceAccess');

// 테이블 자동 생성 (AWS DB 호환)
async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS education_programs (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      category VARCHAR(100),
      type VARCHAR(50),
      duration VARCHAR(100),
      description TEXT,
      instructor VARCHAR(200),
      cost VARCHAR(100),
      link TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      school_id INTEGER REFERENCES schools(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`
    ALTER TABLE education_programs ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id)
  `);
}
ensureTable().catch(err => console.error('education_programs 테이블 생성 실패:', err));

// GET /api/education-programs - 전체 목록
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    let sql = `SELECT ep.*, u.name AS creator_name
       FROM education_programs ep
       LEFT JOIN users u ON ep.created_by = u.id
       WHERE 1=1`;
    const params = [];
    let paramCount = 0;
    const scoped = appendSchoolColumnFilter(sql, params, paramCount, req.user, 'ep.school_id');
    sql = scoped.queryText;
    paramCount = scoped.paramCount;
    sql += ` ORDER BY ep.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const result = await query(sql, params);

    let countSql = 'SELECT COUNT(*) FROM education_programs ep WHERE 1=1';
    const countParams = [];
    const counted = appendSchoolColumnFilter(countSql, countParams, 0, req.user, 'ep.school_id');
    const countResult = await query(counted.queryText, countParams);

    res.json({
      programs: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
    });
  } catch (err) {
    console.error('Get education programs error:', err);
    res.status(500).json({ error: 'Failed to get education programs' });
  }
});

// GET /api/education-programs/:id - 단건 조회
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT ep.*, u.name AS creator_name
       FROM education_programs ep
       LEFT JOIN users u ON ep.created_by = u.id
       WHERE ep.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const program = result.rows[0];
    if (!canSeeSchoolResource(req.user, program.school_id)) {
      return denySchoolResourceAccess(res, req.user);
    }
    res.json({ program });
  } catch (err) {
    console.error('Get education program error:', err);
    res.status(500).json({ error: 'Failed to get education program' });
  }
});

// POST /api/education-programs - 등록 (admin, teacher)
router.post('/', auth, checkRole('admin', 'teacher', 'school_admin'), async (req, res) => {
  try {
    const { title, category, type, duration, description, instructor, cost, link } = req.body;
    if (!title) return res.status(400).json({ error: '제목은 필수입니다.' });

    const result = await query(
      `INSERT INTO education_programs
         (title, category, type, duration, description, instructor, cost, link, created_by, school_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        title, category, type, duration, description, instructor, cost, link,
        req.user.id, req.user.school_id ?? null,
      ]
    );
    res.status(201).json({ program: result.rows[0] });
  } catch (err) {
    console.error('Create education program error:', err);
    res.status(500).json({ error: 'Failed to create education program' });
  }
});

// PUT /api/education-programs/:id - 수정 (admin, teacher - 본인 작성 또는 admin)
router.put('/:id', auth, checkRole('admin', 'teacher', 'school_admin'), async (req, res) => {
  try {
    const existing = await query('SELECT * FROM education_programs WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    const prog = existing.rows[0];
    if (!canSeeSchoolResource(req.user, prog.school_id)) {
      return forbidCrossSchool(res);
    }

    if (!isSystemAdmin(req.user) && req.user.user_type !== 'school_admin'
        && String(prog.created_by) !== String(req.user.id)) {
      return res.status(403).json({ error: '수정 권한이 없습니다.' });
    }

    const { title, category, type, duration, description, instructor, cost, link } = req.body;
    const result = await query(
      `UPDATE education_programs
       SET title=$1, category=$2, type=$3, duration=$4, description=$5,
           instructor=$6, cost=$7, link=$8, updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [title ?? prog.title, category ?? prog.category, type ?? prog.type,
       duration ?? prog.duration, description ?? prog.description,
       instructor ?? prog.instructor, cost ?? prog.cost, link ?? prog.link,
       req.params.id]
    );
    res.json({ program: result.rows[0] });
  } catch (err) {
    console.error('Update education program error:', err);
    res.status(500).json({ error: 'Failed to update education program' });
  }
});

// DELETE /api/education-programs/:id - 삭제 (admin, teacher - 본인 또는 admin)
router.delete('/:id', auth, checkRole('admin', 'teacher', 'school_admin'), async (req, res) => {
  try {
    const existing = await query('SELECT * FROM education_programs WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    const prog = existing.rows[0];
    if (!canSeeSchoolResource(req.user, prog.school_id)) {
      return forbidCrossSchool(res);
    }

    if (!isSystemAdmin(req.user) && req.user.user_type !== 'school_admin'
        && String(prog.created_by) !== String(req.user.id)) {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }

    await query('DELETE FROM education_programs WHERE id = $1', [req.params.id]);
    res.json({ message: '삭제되었습니다.' });
  } catch (err) {
    console.error('Delete education program error:', err);
    res.status(500).json({ error: 'Failed to delete education program' });
  }
});

module.exports = router;
