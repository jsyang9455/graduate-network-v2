const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { auth, checkRole } = require('../middleware/auth');
const { schoolScope, assertSameSchool, forbidCrossSchool } = require('../middleware/schoolScope');
const { isSystemAdmin, isSchoolAdmin } = require('../lib/roles');

function canStaffReadJournal(user, journal) {
  if (isSystemAdmin(user)) return true;
  if (isSchoolAdmin(user)) return assertSameSchool({ user }, journal.school_id);
  if (user.user_type === 'teacher' || user.role === 'teacher') {
    return Number(journal.teacher_id) === Number(user.id);
  }
  return Number(journal.student_id) === Number(user.id) && journal.is_private === false;
}

// ─── GET /api/counseling-journals ────────────────────────────
router.get('/', auth, schoolScope, async (req, res) => {
    try {
        const { user_type, id: userId } = req.user;
        let result;

        if (isSystemAdmin(req.user)) {
            result = await query(
                `SELECT * FROM counseling_journals ORDER BY counseling_date DESC, created_at DESC`
            );
        } else if (isSchoolAdmin(req.user)) {
            result = await query(
                `SELECT * FROM counseling_journals
                 WHERE school_id = $1
                 ORDER BY counseling_date DESC, created_at DESC`,
                [req.user.school_id]
            );
        } else if (user_type === 'teacher') {
            result = await query(
                `SELECT * FROM counseling_journals
                 WHERE teacher_id = $1
                 ORDER BY counseling_date DESC, created_at DESC`,
                [userId]
            );
        } else {
            result = await query(
                `SELECT * FROM counseling_journals
                 WHERE student_id = $1 AND is_private = FALSE
                 ORDER BY counseling_date DESC, created_at DESC`,
                [userId]
            );
        }

        res.json({ journals: result.rows });
    } catch (error) {
        console.error('Get journals error:', error);
        res.status(500).json({ error: '상담일지를 불러오지 못했습니다.' });
    }
});

// ─── GET /api/counseling-journals/:id ────────────────────────
router.get('/:id', auth, schoolScope, async (req, res) => {
    try {
        const result = await query(
            `SELECT * FROM counseling_journals WHERE id = $1`,
            [req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: '상담일지를 찾을 수 없습니다.' });
        }
        const journal = result.rows[0];

        if (!canStaffReadJournal(req.user, journal)) {
            return forbidCrossSchool(res);
        }

        res.json({ journal });
    } catch (error) {
        console.error('Get journal error:', error);
        res.status(500).json({ error: '상담일지를 불러오지 못했습니다.' });
    }
});

// ─── POST /api/counseling-journals ───────────────────────────
router.post('/', auth, checkRole('teacher', 'admin', 'school_admin'), async (req, res) => {
    try {
        const { id: teacherId, name: jwtName } = req.user;

        let teacherName = jwtName;
        if (!teacherName) {
            const userResult = await query('SELECT name FROM users WHERE id = $1', [teacherId]);
            teacherName = userResult.rows[0]?.name || '';
        }

        const {
            student_id = null,
            student_name,
            counseling_date,
            type,
            title,
            content,
            follow_up = null,
            is_private = false,
        } = req.body;

        if (!student_name || !counseling_date || !type || !title || !content) {
            return res.status(400).json({ error: '필수 항목이 누락되었습니다.' });
        }

        if (student_id) {
            const student = await query('SELECT id, school_id FROM users WHERE id = $1', [student_id]);
            if (student.rows.length === 0) {
                return res.status(404).json({ error: '학생을 찾을 수 없습니다.' });
            }
            if (!isSystemAdmin(req.user) && !assertSameSchool(req, student.rows[0].school_id)) {
                return forbidCrossSchool(res);
            }
        }

        const result = await query(
            `INSERT INTO counseling_journals
             (teacher_id, teacher_name, student_id, student_name,
              counseling_date, type, title, content, follow_up, is_private, school_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             RETURNING *`,
            [teacherId, teacherName || '', student_id, student_name,
             counseling_date, type, title, content, follow_up, is_private,
             req.user.school_id || null]
        );

        res.status(201).json({ journal: result.rows[0] });
    } catch (error) {
        console.error('Create journal error:', error);
        res.status(500).json({ error: '상담일지 작성에 실패했습니다.' });
    }
});

// ─── PUT /api/counseling-journals/:id ────────────────────────
router.put('/:id', auth, checkRole('teacher', 'admin', 'school_admin'), async (req, res) => {
    try {
        const { id: userId } = req.user;

        const existing = await query(
            `SELECT * FROM counseling_journals WHERE id = $1`,
            [req.params.id]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: '상담일지를 찾을 수 없습니다.' });
        }
        const journal = existing.rows[0];

        const isOwner = Number(journal.teacher_id) === Number(userId);
        const staffOk = isSystemAdmin(req.user) || (isSchoolAdmin(req.user) && assertSameSchool(req, journal.school_id));
        if (!isOwner && !staffOk) {
            return forbidCrossSchool(res);
        }

        const {
            student_id   = journal.student_id,
            student_name = journal.student_name,
            counseling_date = journal.counseling_date,
            type         = journal.type,
            title        = journal.title,
            content      = journal.content,
            follow_up    = journal.follow_up,
            is_private   = journal.is_private,
        } = req.body;

        const result = await query(
            `UPDATE counseling_journals SET
               student_id = $1, student_name = $2,
               counseling_date = $3, type = $4,
               title = $5, content = $6,
               follow_up = $7, is_private = $8
             WHERE id = $9
             RETURNING *`,
            [student_id, student_name, counseling_date, type,
             title, content, follow_up, is_private, req.params.id]
        );

        res.json({ journal: result.rows[0] });
    } catch (error) {
        console.error('Update journal error:', error);
        res.status(500).json({ error: '상담일지 수정에 실패했습니다.' });
    }
});

// ─── DELETE /api/counseling-journals/:id ─────────────────────
router.delete('/:id', auth, checkRole('teacher', 'admin', 'school_admin'), async (req, res) => {
    try {
        const { id: userId } = req.user;

        const existing = await query(
            `SELECT * FROM counseling_journals WHERE id = $1`,
            [req.params.id]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: '상담일지를 찾을 수 없습니다.' });
        }

        const journal = existing.rows[0];
        const isOwner = Number(journal.teacher_id) === Number(userId);
        const staffOk = isSystemAdmin(req.user) || (isSchoolAdmin(req.user) && assertSameSchool(req, journal.school_id));
        if (!isOwner && !staffOk) {
            return forbidCrossSchool(res);
        }

        await query(`DELETE FROM counseling_journals WHERE id = $1`, [req.params.id]);
        res.json({ message: '상담일지가 삭제되었습니다.' });
    } catch (error) {
        console.error('Delete journal error:', error);
        res.status(500).json({ error: '상담일지 삭제에 실패했습니다.' });
    }
});

module.exports = router;
