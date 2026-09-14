const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { auth, checkRole } = require('../middleware/auth');
const { schoolScope, assertSameSchool, forbidCrossSchool } = require('../middleware/schoolScope');
const { isSystemAdmin, isSchoolAdmin } = require('../lib/roles');
const { sendError } = require('../lib/httpErrors');
const { saveGeneratedFile } = require('../modules/documents/store');
const { renderCounselingPdf, renderCounselingDocx } = require('../modules/documents/counseling');

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

// ─── GET /api/counseling-journals/stats (before /:id) ────────
router.get('/stats', auth, schoolScope, async (req, res) => {
    try {
        const from = req.query.from || '1970-01-01';
        const to = req.query.to || '2999-12-31';
        const params = [from, to];
        let where = `counseling_date BETWEEN $1 AND $2`;

        if (isSystemAdmin(req.user)) {
            if (req.query.school_id) {
                params.push(req.query.school_id);
                where += ` AND school_id = $${params.length}`;
            }
        } else if (isSchoolAdmin(req.user)) {
            params.push(req.user.school_id);
            where += ` AND school_id = $${params.length}`;
        } else if (req.user.user_type === 'teacher' || req.user.role === 'teacher') {
            params.push(req.user.id);
            where += ` AND teacher_id = $${params.length}`;
        } else {
            params.push(req.user.id);
            where += ` AND student_id = $${params.length} AND is_private = FALSE`;
        }

        const byType = await query(
            `SELECT type, COUNT(*)::int AS count
             FROM counseling_journals
             WHERE ${where}
             GROUP BY type
             ORDER BY count DESC`,
            params
        );
        const total = byType.rows.reduce((sum, row) => sum + row.count, 0);
        res.json({ stats: { total, from, to, by_type: byType.rows } });
    } catch (error) {
        console.error('Journal stats error:', error);
        return sendError(res, 500, 'INTERNAL', '상담 통계를 불러오지 못했습니다.');
    }
});

// ─── GET /api/counseling-journals/timeline/:studentId ────────
router.get('/timeline/:studentId', auth, schoolScope, async (req, res) => {
    try {
        const studentId = Number(req.params.studentId);
        const student = await query('SELECT id, school_id, name FROM users WHERE id = $1', [studentId]);
        if (!student.rows.length) {
            return sendError(res, 404, 'NOT_FOUND', '학생을 찾을 수 없습니다.');
        }
        if (!isSystemAdmin(req.user) && !assertSameSchool(req, student.rows[0].school_id)) {
            return forbidCrossSchool(res);
        }

        let sql = `SELECT * FROM counseling_journals WHERE student_id = $1`;
        const params = [studentId];
        if (req.user.user_type === 'teacher' || req.user.role === 'teacher') {
            sql += ` AND teacher_id = $2`;
            params.push(req.user.id);
        } else if (!isSystemAdmin(req.user) && !isSchoolAdmin(req.user)) {
            sql += ` AND is_private = FALSE`;
            if (Number(req.user.id) !== studentId) return forbidCrossSchool(res);
        }
        sql += ` ORDER BY counseling_date DESC, created_at DESC`;
        const result = await query(sql, params);
        res.json({ student: student.rows[0], journals: result.rows });
    } catch (error) {
        console.error('Journal timeline error:', error);
        return sendError(res, 500, 'INTERNAL', '상담 타임라인을 불러오지 못했습니다.');
    }
});

async function persistCounselingExport(req, res, format) {
    const result = await query(`SELECT * FROM counseling_journals WHERE id = $1`, [req.params.id]);
    if (!result.rows.length) {
        return sendError(res, 404, 'NOT_FOUND', '상담일지를 찾을 수 없습니다.');
    }
    const journal = result.rows[0];
    if (!canStaffReadJournal(req.user, journal)) {
        return forbidCrossSchool(res);
    }

    const kind = req.body?.kind === 'confirm' ? 'confirm' : 'journal';
    const isPdf = format === 'pdf';
    const buffer = isPdf
        ? await renderCounselingPdf(journal, { kind })
        : await renderCounselingDocx(journal, { kind });
    const mime = isPdf
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const ext = isPdf ? 'pdf' : 'docx';
    const originalName = `${kind === 'confirm' ? '상담확인서' : '상담일지'}-${journal.id}.${ext}`;
    const file = await saveGeneratedFile({
        buffer,
        mime,
        kind: isPdf ? 'counseling_pdf' : 'counseling_docx',
        schoolId: journal.school_id,
        ownerUserId: journal.teacher_id || req.user.id,
        originalName,
    });
    await query(
        `INSERT INTO counseling_documents (journal_id, file_id, format) VALUES ($1, $2, $3)`,
        [journal.id, file.id, ext]
    );

    const wantsBinary = String(req.headers.accept || '').includes(mime) || req.query.download === '1';
    if (wantsBinary) {
        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(originalName)}`);
        return res.send(buffer);
    }
    return res.status(201).json({ file, document: { journal_id: journal.id, file_id: file.id, format: ext } });
}

router.post('/:id/pdf', auth, schoolScope, async (req, res) => {
    try {
        await persistCounselingExport(req, res, 'pdf');
    } catch (error) {
        console.error('Counseling PDF error:', error);
        return sendError(res, 500, 'INTERNAL', '상담 PDF 생성에 실패했습니다.');
    }
});

router.post('/:id/docx', auth, schoolScope, async (req, res) => {
    try {
        await persistCounselingExport(req, res, 'docx');
    } catch (error) {
        console.error('Counseling DOCX error:', error);
        return sendError(res, 500, 'INTERNAL', '상담 DOCX 생성에 실패했습니다.');
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
            action_taken = null,
            follow_up_at = null,
            is_private = false,
        } = req.body;

        if (!student_name || !counseling_date || !type || !title || !content) {
            return res.status(400).json({ error: '필수 항목이 누락되었습니다.' });
        }
        if (!isValidCounselingType(type)) {
            return sendError(res, 400, 'VALIDATION', '지원하지 않는 상담 유형입니다.');
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
              counseling_date, type, title, content, follow_up, action_taken, follow_up_at, is_private, school_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             RETURNING *`,
            [teacherId, teacherName || '', student_id, student_name,
             counseling_date, type, title, content, follow_up, action_taken, follow_up_at, is_private,
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
            action_taken = journal.action_taken,
            follow_up_at = journal.follow_up_at,
            is_private   = journal.is_private,
        } = req.body;

        if (type && !isValidCounselingType(type)) {
            return sendError(res, 400, 'VALIDATION', '지원하지 않는 상담 유형입니다.');
        }

        const result = await query(
            `UPDATE counseling_journals SET
               student_id = $1, student_name = $2,
               counseling_date = $3, type = $4,
               title = $5, content = $6,
               follow_up = $7, action_taken = $8, follow_up_at = $9, is_private = $10
             WHERE id = $11
             RETURNING *`,
            [student_id, student_name, counseling_date, type,
             title, content, follow_up, action_taken, follow_up_at, is_private, req.params.id]
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
