'use strict';

const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { auth, optionalAuth } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { schoolScope, assertSameSchool, forbidCrossSchool } = require('../middleware/schoolScope');
const { isSystemAdmin, isStaffAdmin } = require('../lib/roles');
const {
  canSeeSchoolResource,
  appendSchoolColumnFilter,
  denySchoolResourceAccess,
} = require('../lib/schoolResourceAccess');
const { sendError } = require('../lib/httpErrors');
const { notifyInApp } = require('../modules/notify');

async function loadTrip(id) {
  const result = await query('SELECT * FROM field_trips WHERE id = $1', [id]);
  return result.rows[0] || null;
}

function toCard(trip) {
  return {
    ...trip,
    // Compat aliases for industry-visit.html which expected announcements shape
    organizer: trip.company_name,
    location: trip.place,
    type: 'industry-visit',
  };
}

// GET /api/field-trips
router.get('/', optionalAuth, async (req, res) => {
  try {
    let queryText = `
      SELECT ft.*,
             (SELECT COUNT(*)::int FROM field_trip_applications fta
              WHERE fta.trip_id = ft.id AND fta.status IN ('pending', 'approved')) AS applicants_count
      FROM field_trips ft
      WHERE ft.is_active = true
    `;
    const params = [];
    let paramCount = 0;
    const filtered = appendSchoolColumnFilter(queryText, params, paramCount, req.user, 'ft.school_id');
    queryText = filtered.queryText;
    paramCount = filtered.paramCount;
    queryText += ' ORDER BY ft.event_date ASC NULLS LAST, ft.id DESC';
    const result = await query(queryText, params);
    res.json({ field_trips: result.rows.map(toCard), trips: result.rows.map(toCard) });
  } catch (err) {
    console.error('field-trips list error:', err);
    res.status(500).json({ error: 'Failed to list field trips' });
  }
});

// POST /api/field-trips
router.post('/', auth, authorize('field_trips', 'write'), schoolScope, async (req, res) => {
  try {
    const {
      company_name, title, description, place, event_date, event_time,
      capacity, deadline, mode, fee, benefits, requirements,
      contact_phone, contact_email, tags, image_url, school_id,
    } = req.body || {};
    if (!company_name || !title) {
      return sendError(res, 400, 'VALIDATION', 'company_name and title required');
    }
    let schoolId = req.user.school_id;
    if (isSystemAdmin(req.user) && school_id) schoolId = school_id;
    if (!schoolId) return sendError(res, 400, 'VALIDATION', 'school_id required');

    const result = await query(
      `INSERT INTO field_trips (
         school_id, company_name, title, description, place, event_date, event_time,
         capacity, deadline, mode, fee, benefits, requirements,
         contact_phone, contact_email, tags, image_url, created_by
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
       ) RETURNING *`,
      [
        schoolId, company_name, title, description || null, place || null,
        event_date || null, event_time || null, capacity || 0, deadline || null,
        mode === 'approval' ? 'approval' : 'fifo', fee || null,
        benefits || null, requirements || null, contact_phone || null,
        contact_email || null, tags || null, image_url || null, req.user.id,
      ]
    );
    res.status(201).json({ field_trip: toCard(result.rows[0]) });
  } catch (err) {
    console.error('field-trips create error:', err);
    res.status(500).json({ error: 'Failed to create field trip' });
  }
});

// GET /api/field-trips/:id
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const trip = await loadTrip(req.params.id);
    if (!trip || !trip.is_active) return sendError(res, 404, 'NOT_FOUND', 'Field trip not found');
    if (!canSeeSchoolResource(req.user, trip.school_id)) {
      return denySchoolResourceAccess(res, req.user);
    }
    res.json({ field_trip: toCard(trip) });
  } catch (err) {
    console.error('field-trips get error:', err);
    res.status(500).json({ error: 'Failed to get field trip' });
  }
});

// PUT /api/field-trips/:id
router.put('/:id', auth, authorize('field_trips', 'write'), schoolScope, async (req, res) => {
  try {
    const trip = await loadTrip(req.params.id);
    if (!trip) return sendError(res, 404, 'NOT_FOUND', 'Field trip not found');
    if (!assertSameSchool(req, trip.school_id) && !isSystemAdmin(req.user)) {
      return forbidCrossSchool(res);
    }
    const b = req.body || {};
    const result = await query(
      `UPDATE field_trips SET
         company_name = COALESCE($1, company_name),
         title = COALESCE($2, title),
         description = COALESCE($3, description),
         place = COALESCE($4, place),
         event_date = COALESCE($5, event_date),
         event_time = COALESCE($6, event_time),
         capacity = COALESCE($7, capacity),
         deadline = COALESCE($8, deadline),
         mode = COALESCE($9, mode),
         fee = COALESCE($10, fee),
         is_active = COALESCE($11, is_active),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $12 RETURNING *`,
      [
        b.company_name, b.title, b.description, b.place, b.event_date, b.event_time,
        b.capacity, b.deadline, b.mode, b.fee, b.is_active, req.params.id,
      ]
    );
    res.json({ field_trip: toCard(result.rows[0]) });
  } catch (err) {
    console.error('field-trips update error:', err);
    res.status(500).json({ error: 'Failed to update field trip' });
  }
});

// POST /api/field-trips/:id/apply (REQ-TRP-002)
router.post('/:id/apply', auth, authorize('field_trips', 'apply'), schoolScope, async (req, res) => {
  try {
    const trip = await loadTrip(req.params.id);
    if (!trip || !trip.is_active) return sendError(res, 404, 'NOT_FOUND', 'Field trip not found');
    if (!assertSameSchool(req, trip.school_id) && !isSystemAdmin(req.user)) {
      return forbidCrossSchool(res);
    }
    if (trip.deadline && new Date(trip.deadline) < new Date(new Date().toDateString())) {
      return sendError(res, 400, 'DEADLINE', '신청 마감되었습니다');
    }

    const dup = await query(
      'SELECT id, status FROM field_trip_applications WHERE trip_id = $1 AND user_id = $2',
      [trip.id, req.user.id]
    );
    if (dup.rows.length && dup.rows[0].status !== 'cancelled') {
      return sendError(res, 409, 'DUPLICATE', '이미 신청하셨습니다');
    }

    const approvedCount = await query(
      `SELECT COUNT(*)::int AS c FROM field_trip_applications
       WHERE trip_id = $1 AND status IN ('pending', 'approved')`,
      [trip.id]
    );
    if (trip.capacity > 0 && approvedCount.rows[0].c >= trip.capacity) {
      return sendError(res, 400, 'CAPACITY', '정원이 마감되었습니다');
    }

    const {
      applicant_name: name,
      applicant_phone: phone,
      applicant_email: email,
      message,
    } = req.body || {};
    if (!name || !phone) {
      return sendError(res, 400, 'VALIDATION', 'applicant_name and applicant_phone required');
    }

    const status = trip.mode === 'fifo' ? 'approved' : 'pending';

    let result;
    if (dup.rows.length && dup.rows[0].status === 'cancelled') {
      result = await query(
        `UPDATE field_trip_applications SET
           applicant_name = $1, applicant_phone = $2, applicant_email = $3,
           message = $4, status = $5, attendance = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $6 RETURNING *`,
        [name, phone, email || null, message || null, status, dup.rows[0].id]
      );
    } else {
      result = await query(
        `INSERT INTO field_trip_applications
           (trip_id, user_id, school_id, applicant_name, applicant_phone, applicant_email, message, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [trip.id, req.user.id, trip.school_id, name, phone, email || null, message || null, status]
      );
    }

    await query(
      `UPDATE field_trips SET current_applicants = (
         SELECT COUNT(*) FROM field_trip_applications
         WHERE trip_id = $1 AND status IN ('pending', 'approved')
       ), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [trip.id]
    );

    await notifyInApp({
      userId: req.user.id,
      type: 'field_trip',
      title: status === 'approved' ? '견학 신청이 확정되었습니다' : '견학 신청이 접수되었습니다',
      message: `「${trip.title}」 신청 상태: ${status === 'approved' ? '승인' : '대기'}`,
      link: 'industry-visit.html',
      eventCode: 'FIELD_TRIP_APPLY',
      schoolId: trip.school_id,
      payload: { trip_id: trip.id, status },
    });

    res.status(201).json({ message: '신청이 완료되었습니다.', application: result.rows[0] });
  } catch (err) {
    console.error('field-trips apply error:', err);
    res.status(500).json({ error: 'Failed to apply' });
  }
});

// PATCH /api/field-trips/applications/:id (approve/reject/cancel)
router.patch('/applications/:id', auth, schoolScope, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!['approved', 'rejected', 'cancelled', 'pending'].includes(status)) {
      return sendError(res, 400, 'VALIDATION', 'Invalid status');
    }
    const appRes = await query(
      `SELECT fta.*, ft.school_id AS trip_school_id, ft.title AS trip_title, ft.capacity, ft.mode
       FROM field_trip_applications fta
       JOIN field_trips ft ON ft.id = fta.trip_id
       WHERE fta.id = $1`,
      [req.params.id]
    );
    if (!appRes.rows.length) return sendError(res, 404, 'NOT_FOUND', 'Application not found');
    const app = appRes.rows[0];

    const isOwner = Number(app.user_id) === Number(req.user.id);
    const canStaff = isSystemAdmin(req.user) || (
      isStaffAdmin(req.user) && assertSameSchool(req, app.trip_school_id)
    );
    const canTeacher = req.user.user_type === 'teacher'
      && assertSameSchool(req, app.trip_school_id);

    if (status === 'cancelled') {
      if (!isOwner && !canStaff && !canTeacher) return forbidCrossSchool(res);
    } else {
      if (!canStaff && !canTeacher) {
        const allowed = await require('../modules/rbac').can(req.user, 'field_trips', 'write');
        if (!allowed || !assertSameSchool(req, app.trip_school_id)) return forbidCrossSchool(res);
      }
    }

    if (status === 'approved' && app.capacity > 0) {
      const cnt = await query(
        `SELECT COUNT(*)::int AS c FROM field_trip_applications
         WHERE trip_id = $1 AND status IN ('pending', 'approved') AND id <> $2`,
        [app.trip_id, app.id]
      );
      if (cnt.rows[0].c >= app.capacity) {
        return sendError(res, 400, 'CAPACITY', '정원이 마감되었습니다');
      }
    }

    const result = await query(
      `UPDATE field_trip_applications SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING *`,
      [status, app.id]
    );
    await query(
      `UPDATE field_trips SET current_applicants = (
         SELECT COUNT(*) FROM field_trip_applications
         WHERE trip_id = $1 AND status IN ('pending', 'approved')
       ), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [app.trip_id]
    );

    if (!isOwner) {
      await notifyInApp({
        userId: app.user_id,
        type: 'field_trip',
        title: '견학 신청 상태가 변경되었습니다',
        message: `「${app.trip_title}」 → ${status}`,
        link: 'industry-visit.html',
        eventCode: 'FIELD_TRIP_STATUS',
        schoolId: app.trip_school_id,
      });
    }

    res.json({ application: result.rows[0] });
  } catch (err) {
    console.error('field-trips application patch error:', err);
    res.status(500).json({ error: 'Failed to update application' });
  }
});

// GET /api/field-trips/:id/roster (REQ-TRP-003)
router.get('/:id/roster', auth, authorize('field_trips', 'read'), schoolScope, async (req, res) => {
  try {
    const trip = await loadTrip(req.params.id);
    if (!trip) return sendError(res, 404, 'NOT_FOUND', 'Field trip not found');
    if (!assertSameSchool(req, trip.school_id) && !isSystemAdmin(req.user)) {
      return forbidCrossSchool(res);
    }
    const result = await query(
      `SELECT fta.*, u.name AS user_name, u.email AS user_email
       FROM field_trip_applications fta
       JOIN users u ON u.id = fta.user_id
       WHERE fta.trip_id = $1
       ORDER BY fta.created_at ASC`,
      [trip.id]
    );
    res.json({ trip: toCard(trip), roster: result.rows });
  } catch (err) {
    console.error('field-trips roster error:', err);
    res.status(500).json({ error: 'Failed to load roster' });
  }
});

// PATCH /api/field-trips/:id/attendance
router.patch('/:id/attendance', auth, authorize('field_trips', 'write'), schoolScope, async (req, res) => {
  try {
    const trip = await loadTrip(req.params.id);
    if (!trip) return sendError(res, 404, 'NOT_FOUND', 'Field trip not found');
    if (!assertSameSchool(req, trip.school_id) && !isSystemAdmin(req.user)) {
      return forbidCrossSchool(res);
    }
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return sendError(res, 400, 'VALIDATION', 'items[{application_id,attendance}] required');

    const updated = [];
    for (const item of items) {
      if (!['present', 'absent', 'excused'].includes(item.attendance)) continue;
      const r = await query(
        `UPDATE field_trip_applications SET attendance = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND trip_id = $3 RETURNING *`,
        [item.attendance, item.application_id, trip.id]
      );
      if (r.rows[0]) updated.push(r.rows[0]);
    }
    res.json({ updated });
  } catch (err) {
    console.error('field-trips attendance error:', err);
    res.status(500).json({ error: 'Failed to update attendance' });
  }
});

// GET/PUT after-report (REQ-TRP-003)
router.get('/:id/report', auth, authorize('field_trips', 'read'), schoolScope, async (req, res) => {
  try {
    const trip = await loadTrip(req.params.id);
    if (!trip) return sendError(res, 404, 'NOT_FOUND', 'Field trip not found');
    if (!assertSameSchool(req, trip.school_id) && !isSystemAdmin(req.user)) {
      return forbidCrossSchool(res);
    }
    const result = await query(
      `SELECT r.*, u.name AS author_name
       FROM field_trip_reports r
       JOIN users u ON u.id = r.author_id
       WHERE r.trip_id = $1`,
      [trip.id]
    );
    res.json({ trip: toCard(trip), report: result.rows[0] || null });
  } catch (err) {
    console.error('field-trips get report error:', err);
    res.status(500).json({ error: 'Failed to load report' });
  }
});

router.put('/:id/report', auth, authorize('field_trips', 'write'), schoolScope, async (req, res) => {
  try {
    const trip = await loadTrip(req.params.id);
    if (!trip) return sendError(res, 404, 'NOT_FOUND', 'Field trip not found');
    if (!assertSameSchool(req, trip.school_id) && !isSystemAdmin(req.user)) {
      return forbidCrossSchool(res);
    }
    const summary = (req.body?.summary || '').trim();
    if (!summary) return sendError(res, 400, 'VALIDATION', 'summary required');

    const outcome = req.body?.outcome || null;
    const notes = req.body?.notes || null;
    const attendeesPresent = Number.isFinite(Number(req.body?.attendees_present))
      ? Number(req.body.attendees_present) : 0;
    const attendeesAbsent = Number.isFinite(Number(req.body?.attendees_absent))
      ? Number(req.body.attendees_absent) : 0;
    let fileIds = Array.isArray(req.body?.file_ids)
      ? req.body.file_ids.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 10)
      : [];

    const result = await query(
      `INSERT INTO field_trip_reports (
         trip_id, school_id, author_id, summary, outcome,
         attendees_present, attendees_absent, notes, file_ids
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (trip_id) DO UPDATE SET
         summary = EXCLUDED.summary,
         outcome = EXCLUDED.outcome,
         attendees_present = EXCLUDED.attendees_present,
         attendees_absent = EXCLUDED.attendees_absent,
         notes = EXCLUDED.notes,
         file_ids = EXCLUDED.file_ids,
         author_id = EXCLUDED.author_id,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        trip.id, trip.school_id, req.user.id, summary, outcome,
        attendeesPresent, attendeesAbsent, notes, fileIds,
      ]
    );
    res.json({ report: result.rows[0], trip: toCard(trip) });
  } catch (err) {
    console.error('field-trips put report error:', err);
    res.status(500).json({ error: 'Failed to save report' });
  }
});

module.exports = router;
