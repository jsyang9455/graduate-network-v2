const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { auth } = require('../middleware/auth');
const { schoolScope, assertSameSchool, forbidCrossSchool } = require('../middleware/schoolScope');
const { isSystemAdmin, isStaffAdmin } = require('../lib/roles');
const { sendError } = require('../lib/httpErrors');
const notify = require('../modules/notify');

async function ensureIsCounselorColumn() {
  try {
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_counselor BOOLEAN DEFAULT false`);
  } catch (err) {
    console.warn('is_counselor 컬럼 마이그레이션 경고:', err.message);
  }
}
ensureIsCounselorColumn();

const OWNER_ALLOWED_STATUSES = ['cancelled'];

function isOwner(req, session) {
  return Number(session.user_id) === Number(req.user.id);
}

function isAssignedCounselor(req, session) {
  if (session.counselor_id == null || Number(session.counselor_id) !== Number(req.user.id)) return false;
  return session.school_id == null || assertSameSchool(req, session.school_id);
}

/** REQ-CNS-006: status/notes are managed by the assigned counselor or staff admins of the session's school. */
function canManageSession(req, session) {
  if (isSystemAdmin(req.user)) return true;
  if (isAssignedCounselor(req, session)) return true;
  return isStaffAdmin(req.user) && assertSameSchool(req, session.school_id);
}

function canAccessSession(req, session) {
  if (!session) return false;
  if (isSystemAdmin(req.user)) return true;
  if (isOwner(req, session)) return true;
  if (isAssignedCounselor(req, session)) return true;
  if ((isStaffAdmin(req.user) || req.user.user_type === 'teacher') && assertSameSchool(req, session.school_id)) {
    return true;
  }
  return false;
}

/** Same rule as POST: active teacher, same school as the session (REQ-IAM-009). */
async function validateCounselorForSession(res, counselorId, schoolId) {
  const counselor = await query(
    `SELECT id, school_id, name FROM users WHERE id = $1 AND user_type = 'teacher' AND is_active = true`,
    [counselorId]
  );
  if (!counselor.rows.length) {
    sendError(res, 404, 'NOT_FOUND', '상담교사를 찾을 수 없습니다');
    return false;
  }
  if (schoolId != null && Number(counselor.rows[0].school_id) !== Number(schoolId)) {
    forbidCrossSchool(res);
    return false;
  }
  return true;
}

function denySession(res, session, req) {
  if (session && session.school_id != null && !isSystemAdmin(req.user) && !assertSameSchool(req, session.school_id)
      && Number(session.user_id) !== Number(req.user.id)) {
    return forbidCrossSchool(res);
  }
  return sendError(res, 404, 'NOT_FOUND', 'Session not found');
}

router.get('/teachers', auth, schoolScope, async (req, res) => {
  try {
    const colCheck = await query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'users' AND column_name = 'school_name'`
    );
    const hasSchoolName = colCheck.rows.length > 0;
    const schoolNameSel = hasSchoolName ? 'school_name' : 'null AS school_name';

    const params = [];
    let sql = `
      SELECT id, name, email, ${schoolNameSel}, school_id
      FROM users
      WHERE user_type = 'teacher' AND is_active = true
        AND COALESCE(is_counselor, false) = true
    `;
    if (!isSystemAdmin(req.user)) {
      if (!req.user.school_id) {
        return res.json({ teachers: [] });
      }
      params.push(req.user.school_id);
      sql += ` AND school_id = $1`;
    }
    sql += ' ORDER BY name';
    const result = await query(sql, params);
    res.json({ teachers: result.rows });
  } catch (error) {
    console.error('Get teachers error:', error);
    res.status(500).json({ error: 'Failed to get teachers' });
  }
});

router.get('/available-slots', auth, schoolScope, async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }

    const counselorParams = [];
    let counselorSql = `SELECT id, name FROM users WHERE user_type = 'teacher' AND is_active = true`;
    if (!isSystemAdmin(req.user)) {
      if (!req.user.school_id) {
        return res.json({ date, counselors: [], slots: [], bookedSessions: [] });
      }
      counselorParams.push(req.user.school_id);
      counselorSql += ' AND school_id = $1';
    }
    const counselors = await query(counselorSql, counselorParams);

    const bookedSessions = await query(
      `SELECT counselor_id, session_date, duration_minutes
       FROM counseling_sessions
       WHERE DATE(session_date) = $1 AND status = 'scheduled'
         ${(!isSystemAdmin(req.user) && req.user.school_id) ? 'AND (school_id = $2 OR school_id IS NULL)' : ''}`,
      (!isSystemAdmin(req.user) && req.user.school_id) ? [date, req.user.school_id] : [date]
    );

    const slots = [];
    for (let hour = 9; hour <= 17; hour++) {
      slots.push({
        time: `${hour.toString().padStart(2, '0')}:00`,
        available: true,
      });
    }

    res.json({
      date,
      counselors: counselors.rows,
      slots,
      bookedSessions: bookedSessions.rows,
    });
  } catch (error) {
    console.error('Get slots error:', error);
    res.status(500).json({ error: 'Failed to get available slots' });
  }
});

router.get('/', auth, schoolScope, async (req, res) => {
  try {
    const colCheck = await query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'counseling_sessions' AND column_name = 'counselor_id'`
    );
    const hasCounselorId = colCheck.rows.length > 0;

    const params = [];
    let where;
    if (isSystemAdmin(req.user)) {
      where = '1=1';
    } else if (isStaffAdmin(req.user) && req.user.school_id) {
      params.push(req.user.school_id);
      where = 'cs.school_id = $1';
    } else if (hasCounselorId) {
      params.push(req.user.id);
      where = '(cs.user_id = $1 OR cs.counselor_id = $1)';
      if (req.user.school_id) {
        params.push(req.user.school_id);
        where += ` AND (cs.school_id = $${params.length} OR cs.school_id IS NULL)`;
      }
    } else {
      params.push(req.user.id);
      where = 'cs.user_id = $1';
    }

    const counselorJoin = hasCounselorId
      ? 'LEFT JOIN users u2 ON cs.counselor_id = u2.id'
      : '';
    const counselorSel = hasCounselorId ? 'u2.name as counselor_name' : 'null as counselor_name';

    const result = await query(
      `SELECT cs.*,
              u1.name as user_name, u1.email as user_email,
              ${counselorSel}
       FROM counseling_sessions cs
       JOIN users u1 ON cs.user_id = u1.id
       ${counselorJoin}
       WHERE ${where}
       ORDER BY cs.session_date DESC`,
      params
    );

    res.json({ sessions: result.rows });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const {
      session_type,
      session_date,
      duration_minutes = 60,
      topic,
      counselor_id,
    } = req.body;

    if (!session_date) {
      return res.status(400).json({ error: 'Session date is required' });
    }

    if (counselor_id) {
      const counselor = await query(
        `SELECT id, school_id, name FROM users WHERE id = $1 AND user_type = 'teacher' AND is_active = true`,
        [counselor_id]
      );
      if (!counselor.rows.length) {
        return sendError(res, 404, 'NOT_FOUND', '상담교사를 찾을 수 없습니다');
      }
      if (!isSystemAdmin(req.user) && req.user.school_id
          && counselor.rows[0].school_id != null
          && Number(counselor.rows[0].school_id) !== Number(req.user.school_id)) {
        return forbidCrossSchool(res);
      }
    }

    const colCheck = await query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'counseling_sessions' AND column_name = 'counselor_id'`
    );
    const hasCounselorId = colCheck.rows.length > 0;

    const statusCheck = await query(
      `SELECT pg_get_constraintdef(c.oid) as def
       FROM pg_constraint c
       JOIN pg_class t ON c.conrelid = t.oid
       WHERE t.relname = 'counseling_sessions' AND c.contype = 'c'
         AND c.conname LIKE '%status%'`
    );
    const allowsPending = !statusCheck.rows.length
      || statusCheck.rows.some((r) => r.def && r.def.includes('pending'));
    const insertStatus = allowsPending ? 'pending' : 'scheduled';
    const schoolId = req.user.school_id || null;

    let result;
    if (hasCounselorId) {
      result = await query(
        `INSERT INTO counseling_sessions
         (user_id, counselor_id, session_type, session_date, duration_minutes, topic, status, school_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [req.user.id, counselor_id || null, session_type, session_date, duration_minutes, topic, insertStatus, schoolId]
      );
    } else {
      result = await query(
        `INSERT INTO counseling_sessions
         (user_id, session_type, session_date, duration_minutes, topic, status, school_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [req.user.id, session_type, session_date, duration_minutes, topic, insertStatus, schoolId]
      );
    }

    const session = result.rows[0];
    if (session.counselor_id) {
      await notify.emit('CNS_RESERVATION', {
        userId: session.counselor_id,
        type: 'counseling',
        title: '새 상담 예약이 있습니다',
        message: `${req.user.name || '학생'}님이 상담을 신청했습니다.`,
        link: '/counseling.html',
        schoolId,
        payload: { session_id: session.id },
      });
    }

    res.status(201).json({
      message: 'Counseling session booked successfully',
      session,
    });
  } catch (error) {
    console.error('Book session error:', error);
    res.status(500).json({ error: 'Failed to book session' });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      counselor_id,
      session_date,
      duration_minutes,
      status,
      notes,
    } = req.body;

    const sessionCheck = await query(
      'SELECT * FROM counseling_sessions WHERE id = $1',
      [id]
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionCheck.rows[0];
    if (!canAccessSession(req, session)) {
      return denySession(res, session, req);
    }

    const manager = canManageSession(req, session);
    if (!manager && !isOwner(req, session)) {
      return sendError(res, 403, 'FORBIDDEN', '담당 상담교사 또는 학교 관리자만 수정할 수 있습니다');
    }
    if (!manager) {
      if (status != null && !OWNER_ALLOWED_STATUSES.includes(status)) {
        return sendError(res, 403, 'FORBIDDEN', '신청자는 상담을 취소만 할 수 있습니다');
      }
      if (notes != null) {
        return sendError(res, 403, 'FORBIDDEN', '상담 메모는 담당 상담교사만 작성할 수 있습니다');
      }
    }

    if (counselor_id != null && Number(counselor_id) !== Number(session.counselor_id)) {
      const schoolId = session.school_id != null ? session.school_id : (req.user.school_id || null);
      if (!(await validateCounselorForSession(res, counselor_id, schoolId))) return;
    }

    const result = await query(
      `UPDATE counseling_sessions
       SET counselor_id = COALESCE($1, counselor_id),
           session_date = COALESCE($2, session_date),
           duration_minutes = COALESCE($3, duration_minutes),
           status = COALESCE($4, status),
           notes = COALESCE($5, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [counselor_id, session_date, duration_minutes, status, notes, id]
    );

    res.json({
      message: 'Session updated successfully',
      session: result.rows[0],
    });
  } catch (error) {
    console.error('Update session error:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const sessionCheck = await query(
      'SELECT * FROM counseling_sessions WHERE id = $1',
      [id]
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionCheck.rows[0];
    if (Number(session.user_id) !== Number(req.user.id) && !isSystemAdmin(req.user)
        && !(isStaffAdmin(req.user) && assertSameSchool(req, session.school_id))) {
      if (session.school_id != null && !assertSameSchool(req, session.school_id)) {
        return forbidCrossSchool(res);
      }
      return sendError(res, 403, 'FORBIDDEN', 'Not authorized');
    }

    await query(
      `UPDATE counseling_sessions
       SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );

    res.json({ message: 'Session cancelled successfully' });
  } catch (error) {
    console.error('Cancel session error:', error);
    res.status(500).json({ error: 'Failed to cancel session' });
  }
});

module.exports = router;
