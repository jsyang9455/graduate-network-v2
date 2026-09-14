const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { auth, optionalAuth } = require('../middleware/auth');
const { forbidCrossSchool } = require('../middleware/schoolScope');
const { isSystemAdmin, isStaffAdmin } = require('../lib/roles');
const {
  canSeeSchoolResource,
  appendSchoolColumnFilter,
  denySchoolResourceAccess,
} = require('../lib/schoolResourceAccess');

async function loadAnnouncementById(id) {
  const result = await query(
    'SELECT * FROM announcements WHERE id = $1 AND is_active = true',
    [id]
  );
  return result.rows[0] || null;
}

// ── 신청 관련 API ─────────────────────────────────────────────

// 신청하기 (로그인 필수)
router.post('/apply', auth, async (req, res) => {
  try {
    const { announcement_id, applicant_name, applicant_phone, applicant_email, message } = req.body;
    if (!announcement_id || !applicant_name || !applicant_phone) {
      return res.status(400).json({ error: '공고 ID, 이름, 연락처는 필수입니다.' });
    }

    // 중복 신청 체크
    const dup = await query(
      'SELECT id FROM announcement_applications WHERE announcement_id = $1 AND user_id = $2',
      [announcement_id, req.user.id]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: '이미 신청하셨습니다.' });
    }

    const ann = await loadAnnouncementById(announcement_id);
    if (!ann) {
      return res.status(404).json({ error: '공고를 찾을 수 없습니다.' });
    }
    if (!canSeeSchoolResource(req.user, ann.school_id)) {
      return forbidCrossSchool(res);
    }

    const result = await query(
      `INSERT INTO announcement_applications
         (announcement_id, user_id, applicant_name, applicant_phone, applicant_email, message)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [announcement_id, req.user.id, applicant_name, applicant_phone, applicant_email || null, message || null]
    );

    // current_applicants 증가
    await query(
      'UPDATE announcements SET current_applicants = current_applicants + 1 WHERE id = $1',
      [announcement_id]
    );

    res.json({ message: '신청이 완료되었습니다.', application: result.rows[0] });
  } catch (error) {
    console.error('Apply error:', error);
    res.status(500).json({ error: '신청 처리 중 오류가 발생했습니다.' });
  }
});

// 내 신청 목록 (로그인 필수)
router.get('/my-applications', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT aa.*, a.title, a.type, a.event_date, a.location
       FROM announcement_applications aa
       JOIN announcements a ON a.id = aa.announcement_id
       WHERE aa.user_id = $1
       ORDER BY aa.created_at DESC`,
      [req.user.id]
    );
    res.json({ applications: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get applications' });
  }
});

// 전체 신청 내역 조회 (관리자 전용)
router.get('/applications/all', auth, async (req, res) => {
  try {
    if (!isStaffAdmin(req.user)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const { type, announcement_id } = req.query;

    let sql = `
      SELECT aa.id, aa.applicant_name, aa.applicant_phone, aa.applicant_email,
             aa.message, aa.status, aa.created_at,
             a.id as announcement_id, a.title as announcement_title,
             a.type as announcement_type, a.event_date
      FROM announcement_applications aa
      JOIN announcements a ON a.id = aa.announcement_id
      WHERE 1=1`;
    const params = [];

    if (!isSystemAdmin(req.user) && req.user.school_id) {
      params.push(req.user.school_id);
      sql += ` AND a.school_id = $${params.length}`;
    }

    if (type) {
      params.push(type);
      sql += ` AND a.type = $${params.length}`;
    }
    if (announcement_id) {
      params.push(announcement_id);
      sql += ` AND aa.announcement_id = $${params.length}`;
    }
    sql += ' ORDER BY aa.created_at DESC';

    const result = await query(sql, params);
    res.json({ applications: result.rows });
  } catch (error) {
    console.error('Get all applications error:', error);
    res.status(500).json({ error: 'Failed to get applications' });
  }
});

// 신청 상태 변경 (관리자 전용)
router.put('/applications/:id/status', auth, async (req, res) => {
  try {
    if (!isStaffAdmin(req.user)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['pending', 'approved', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: '유효하지 않은 상태값입니다.' });
    }

    if (!isSystemAdmin(req.user) && req.user.school_id) {
      const scope = await query(
        `SELECT aa.id FROM announcement_applications aa
         JOIN announcements a ON a.id = aa.announcement_id
         WHERE aa.id = $1 AND a.school_id = $2`,
        [id, req.user.school_id]
      );
      if (!scope.rows.length) {
        return forbidCrossSchool(res);
      }
    }

    const result = await query(
      'UPDATE announcement_applications SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: '상태가 변경되었습니다.', application: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// ── 공지사항 조회 API ─────────────────────────────────────────────

// Get all announcements by type
router.get('/:type', optionalAuth, async (req, res) => {
  try {
    const { type } = req.params;
    
    // Validate type
    const validTypes = ['job-fair', 'industry-visit', 'certification'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid announcement type' });
    }

    let sql = `SELECT * FROM announcements a WHERE type = $1 AND is_active = true`;
    const params = [type];
    let paramCount = 1;
    const scoped = appendSchoolColumnFilter(sql, params, paramCount, req.user, 'a.school_id');
    sql = `${scoped.queryText} ORDER BY event_date DESC, created_at DESC`;

    const result = await query(sql, params);

    res.json({ announcements: result.rows });
  } catch (error) {
    console.error('Get announcements error:', error);
    res.status(500).json({ error: 'Failed to get announcements' });
  }
});

// Get single announcement
router.get('/detail/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const ann = await loadAnnouncementById(id);

    if (!ann) {
      return res.status(404).json({ error: 'Announcement not found' });
    }
    if (!canSeeSchoolResource(req.user, ann.school_id)) {
      return denySchoolResourceAccess(res, req.user);
    }

    res.json({ announcement: ann });
  } catch (error) {
    console.error('Get announcement detail error:', error);
    res.status(500).json({ error: 'Failed to get announcement' });
  }
});

// Create announcement (admin only)
router.post('/', auth, async (req, res) => {
  try {
    if (!isStaffAdmin(req.user)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const {
      type,
      title,
      organizer,
      description,
      event_date,
      event_time,
      location,
      deadline,
      capacity,
      fee,
      benefits,
      requirements,
      contact_phone,
      contact_email,
      tags,
      rating,
      review_count,
      image_url,
      detail_url
    } = req.body;

    if (!type || !title) {
      return res.status(400).json({ error: 'Type and title are required' });
    }

    const schoolId = isSystemAdmin(req.user) ? (req.body.school_id ?? req.user.school_id ?? null) : req.user.school_id;

    const result = await query(
      `INSERT INTO announcements (
        type, title, organizer, description, event_date, event_time, 
        location, deadline, capacity, fee, benefits, requirements,
        contact_phone, contact_email, tags, rating, review_count,
        image_url, detail_url, school_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *`,
      [
        type, title, organizer, description, event_date, event_time,
        location, deadline, capacity, fee, benefits, requirements,
        contact_phone, contact_email, tags, rating, review_count,
        image_url, detail_url, schoolId,
      ]
    );

    res.json({
      message: 'Announcement created successfully',
      announcement: result.rows[0]
    });
  } catch (error) {
    console.error('Create announcement error:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to create announcement', detail: error.message });
  }
});

// Update announcement (admin only)
router.put('/:id', auth, async (req, res) => {
  try {
    if (!isStaffAdmin(req.user)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    const existing = await query('SELECT school_id FROM announcements WHERE id = $1 AND is_active = true', [id]);
    if (!existing.rows.length) {
      return res.status(404).json({ error: 'Announcement not found' });
    }
    if (!canSeeSchoolResource(req.user, existing.rows[0].school_id)) {
      return forbidCrossSchool(res);
    }
    const {
      type,
      title,
      organizer,
      description,
      event_date,
      event_time,
      location,
      deadline,
      capacity,
      current_applicants,
      fee,
      benefits,
      requirements,
      contact_phone,
      contact_email,
      tags,
      rating,
      review_count,
      image_url,
      detail_url
    } = req.body;

    const result = await query(
      `UPDATE announcements SET
        type = $1, title = $2, organizer = $3, description = $4,
        event_date = $5, event_time = $6, location = $7, deadline = $8,
        capacity = $9, current_applicants = $10, fee = $11, benefits = $12,
        requirements = $13, contact_phone = $14, contact_email = $15,
        tags = $16, rating = $17, review_count = $18, image_url = $19,
        detail_url = $20, updated_at = CURRENT_TIMESTAMP
      WHERE id = $21 AND is_active = true
      RETURNING *`,
      [
        type, title, organizer, description, event_date, event_time,
        location, deadline, capacity, current_applicants, fee, benefits,
        requirements, contact_phone, contact_email, tags, rating,
        review_count, image_url, detail_url, id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    res.json({
      message: 'Announcement updated successfully',
      announcement: result.rows[0]
    });
  } catch (error) {
    console.error('Update announcement error:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to update announcement', detail: error.message });
  }
});

// Delete announcement (admin only - soft delete)
router.delete('/:id', auth, async (req, res) => {
  try {
    if (!isStaffAdmin(req.user)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    const existing = await query('SELECT school_id FROM announcements WHERE id = $1', [id]);
    if (!existing.rows.length) {
      return res.status(404).json({ error: 'Announcement not found' });
    }
    if (!canSeeSchoolResource(req.user, existing.rows[0].school_id)) {
      return forbidCrossSchool(res);
    }

    const result = await query(
      `UPDATE announcements 
       SET is_active = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, title, type`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    res.json({
      message: 'Announcement deleted successfully',
      announcement: result.rows[0]
    });
  } catch (error) {
    console.error('Delete announcement error:', error);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

module.exports = router;
