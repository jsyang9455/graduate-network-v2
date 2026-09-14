const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { auth } = require('../middleware/auth');
const { schoolScope, assertSameSchool, forbidCrossSchool } = require('../middleware/schoolScope');
const { isSystemAdmin } = require('../lib/roles');
const { sendError } = require('../lib/httpErrors');

async function loadUserSchool(userId) {
  const result = await query('SELECT id, school_id, name FROM users WHERE id = $1 AND is_active = true', [userId]);
  return result.rows[0] || null;
}

function sameSchoolOrAdmin(req, otherSchoolId) {
  if (isSystemAdmin(req.user)) return true;
  return assertSameSchool(req, otherSchoolId);
}

// Get connections
router.get('/connections', auth, schoolScope, async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*,
              CASE 
                WHEN c.requester_id = $1 THEN u2.id
                ELSE u1.id
              END as connection_id,
              CASE 
                WHEN c.requester_id = $1 THEN u2.name
                ELSE u1.name
              END as connection_name,
              CASE 
                WHEN c.requester_id = $1 THEN u2.profile_image
                ELSE u1.profile_image
              END as connection_image,
              CASE 
                WHEN c.requester_id = $1 THEN gp2.current_company
                ELSE gp1.current_company
              END as current_company,
              CASE 
                WHEN c.requester_id = $1 THEN gp2.current_position
                ELSE gp1.current_position
              END as current_position
       FROM connections c
       JOIN users u1 ON c.requester_id = u1.id
       JOIN users u2 ON c.receiver_id = u2.id
       LEFT JOIN graduate_profiles gp1 ON u1.id = gp1.user_id
       LEFT JOIN graduate_profiles gp2 ON u2.id = gp2.user_id
       WHERE (c.requester_id = $1 OR c.receiver_id = $1)
       AND c.status = 'accepted'
       ORDER BY c.updated_at DESC`,
      [req.user.id]
    );

    res.json({ connections: result.rows });
  } catch (error) {
    console.error('Get connections error:', error);
    res.status(500).json({ error: 'Failed to get connections' });
  }
});

// Get connection requests (pending)
router.get('/requests', auth, schoolScope, async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*, 
              u.id as requester_id, u.name as requester_name, 
              u.profile_image as requester_image,
              gp.current_company, gp.current_position
       FROM connections c
       JOIN users u ON c.requester_id = u.id
       LEFT JOIN graduate_profiles gp ON u.id = gp.user_id
       WHERE c.receiver_id = $1 AND c.status = 'pending'
       ORDER BY c.created_at DESC`,
      [req.user.id]
    );

    res.json({ requests: result.rows });
  } catch (error) {
    console.error('Get requests error:', error);
    res.status(500).json({ error: 'Failed to get requests' });
  }
});

// Send connection request — same school only (REQ-IAM-009)
router.post('/connect/:userId', auth, schoolScope, async (req, res) => {
  try {
    const { userId } = req.params;
    const { message } = req.body;

    if (parseInt(userId, 10) === req.user.id) {
      return res.status(400).json({ error: 'Cannot connect to yourself' });
    }

    const target = await loadUserSchool(userId);
    if (!target) {
      return sendError(res, 404, 'NOT_FOUND', 'User not found');
    }
    if (!sameSchoolOrAdmin(req, target.school_id)) {
      return forbidCrossSchool(res);
    }

    const existing = await query(
      `SELECT id, status FROM connections 
       WHERE (requester_id = $1 AND receiver_id = $2) 
       OR (requester_id = $2 AND receiver_id = $1)`,
      [req.user.id, userId]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Connection already exists',
        status: existing.rows[0].status 
      });
    }

    const result = await query(
      `INSERT INTO connections (requester_id, receiver_id, message, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [req.user.id, userId, message]
    );

    res.status(201).json({
      message: 'Connection request sent',
      connection: result.rows[0]
    });
  } catch (error) {
    console.error('Connect error:', error);
    res.status(500).json({ error: 'Failed to send connection request' });
  }
});

// Accept/Reject connection request
router.put('/requests/:id', auth, schoolScope, async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'accept' or 'reject'

    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const requestCheck = await query(
      'SELECT * FROM connections WHERE id = $1 AND receiver_id = $2',
      [id, req.user.id]
    );

    if (requestCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const status = action === 'accept' ? 'accepted' : 'rejected';
    
    const result = await query(
      `UPDATE connections 
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    res.json({
      message: `Connection request ${action}ed`,
      connection: result.rows[0]
    });
  } catch (error) {
    console.error('Update request error:', error);
    res.status(500).json({ error: 'Failed to update request' });
  }
});

// Remove connection
router.delete('/connect/:userId', auth, schoolScope, async (req, res) => {
  try {
    const { userId } = req.params;
    await query(
      `DELETE FROM connections
       WHERE (requester_id = $1 AND receiver_id = $2)
          OR (requester_id = $2 AND receiver_id = $1)`,
      [req.user.id, userId]
    );
    res.json({ message: 'Connection removed' });
  } catch (error) {
    console.error('Remove connection error:', error);
    res.status(500).json({ error: 'Failed to remove connection' });
  }
});

// Get mentors — school-scoped (REQ-IAM-009)
router.get('/mentors', auth, schoolScope, async (req, res) => {
  try {
    const { major, company, search } = req.query;

    let queryText = `
      SELECT u.id, u.name, u.profile_image, u.school_id,
             gp.graduation_year, gp.major, gp.current_company, 
             gp.current_position, gp.bio, gp.skills, gp.mentor_capacity
      FROM users u
      JOIN graduate_profiles gp ON u.id = gp.user_id
      WHERE gp.is_mentor = true AND gp.mentor_capacity > 0
    `;
    const params = [];
    let paramCount = 0;

    if (!isSystemAdmin(req.user)) {
      if (req.user.school_id == null) {
        return res.json({ mentors: [] });
      }
      paramCount += 1;
      queryText += ` AND u.school_id = $${paramCount}`;
      params.push(req.user.school_id);
    }

    if (major) {
      paramCount++;
      queryText += ` AND gp.major ILIKE $${paramCount}`;
      params.push(`%${major}%`);
    }

    if (company) {
      paramCount++;
      queryText += ` AND gp.current_company ILIKE $${paramCount}`;
      params.push(`%${company}%`);
    }

    if (search) {
      paramCount++;
      queryText += ` AND (u.name ILIKE $${paramCount} OR gp.bio ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    queryText += ` ORDER BY gp.mentor_capacity DESC, u.created_at DESC`;

    const result = await query(queryText, params);
    res.json({ mentors: result.rows });
  } catch (error) {
    console.error('Get mentors error:', error);
    res.status(500).json({ error: 'Failed to get mentors' });
  }
});

// Request mentorship — same school only
router.post('/mentorship/:mentorId', auth, schoolScope, async (req, res) => {
  try {
    const { mentorId } = req.params;
    const { notes } = req.body;

    const mentorUser = await loadUserSchool(mentorId);
    if (!mentorUser) {
      return sendError(res, 404, 'NOT_FOUND', 'Mentor not found');
    }
    if (!sameSchoolOrAdmin(req, mentorUser.school_id)) {
      return forbidCrossSchool(res);
    }

    const mentorCheck = await query(
      `SELECT gp.is_mentor, gp.mentor_capacity,
              (SELECT COUNT(*) FROM mentorships WHERE mentor_id = $1 AND status = 'active') as active_mentees
       FROM graduate_profiles gp
       WHERE gp.user_id = $1`,
      [mentorId]
    );

    if (mentorCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Mentor not found' });
    }

    const mentor = mentorCheck.rows[0];
    if (!mentor.is_mentor || mentor.active_mentees >= mentor.mentor_capacity) {
      return res.status(400).json({ error: 'Mentor not available' });
    }

    const existing = await query(
      `SELECT id FROM mentorships 
       WHERE mentor_id = $1 AND mentee_id = $2 AND status = 'active'`,
      [mentorId, req.user.id]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Mentorship already exists' });
    }

    const result = await query(
      `INSERT INTO mentorships (mentor_id, mentee_id, notes, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING *`,
      [mentorId, req.user.id, notes]
    );

    res.status(201).json({
      message: 'Mentorship created successfully',
      mentorship: result.rows[0]
    });
  } catch (error) {
    console.error('Request mentorship error:', error);
    res.status(500).json({ error: 'Failed to request mentorship' });
  }
});

// Get my mentorships
router.get('/my-mentorships', auth, schoolScope, async (req, res) => {
  try {
    const result = await query(
      `SELECT m.*,
              u1.name as mentor_name, u1.profile_image as mentor_image,
              u2.name as mentee_name, u2.profile_image as mentee_image,
              gp1.current_company as mentor_company, gp1.current_position as mentor_position,
              gp2.graduation_year as mentee_graduation_year, gp2.major as mentee_major
       FROM mentorships m
       JOIN users u1 ON m.mentor_id = u1.id
       JOIN users u2 ON m.mentee_id = u2.id
       LEFT JOIN graduate_profiles gp1 ON u1.id = gp1.user_id
       LEFT JOIN graduate_profiles gp2 ON u2.id = gp2.user_id
       WHERE (m.mentor_id = $1 OR m.mentee_id = $1)
       ORDER BY m.created_at DESC`,
      [req.user.id]
    );

    res.json({ mentorships: result.rows });
  } catch (error) {
    console.error('Get mentorships error:', error);
    res.status(500).json({ error: 'Failed to get mentorships' });
  }
});

module.exports = router;
