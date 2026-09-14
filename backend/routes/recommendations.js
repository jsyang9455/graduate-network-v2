'use strict';

const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { auth } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { schoolScope, forbidCrossSchool } = require('../middleware/schoolScope');
const { isSystemAdmin, isStaffAdmin } = require('../lib/roles');
const { sendError } = require('../lib/httpErrors');
const recommendations = require('../modules/recommendations');

// GET /api/recommendations/me — ranked feed with reasons (REQ-REC-004)
router.get('/me', auth, authorize('recommendations', 'read'), schoolScope, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    let rows = await query(
      `SELECT jr.score, jr.reasons, jr.computed_at,
              j.id, j.title, j.description, j.location, j.salary_range, j.deadline,
              j.job_type, j.status, j.company_id, j.school_id,
              u.name AS company_name
       FROM job_recommendations jr
       JOIN jobs j ON j.id = jr.job_id
       LEFT JOIN users u ON u.id = j.company_id
       WHERE jr.user_id = $1 AND j.status = 'active'
       ORDER BY jr.score DESC, jr.computed_at DESC
       LIMIT $2`,
      [req.user.id, limit]
    );

    if (!rows.rows.length) {
      await recommendations.recomputeForUser(req.user.id);
      rows = await query(
        `SELECT jr.score, jr.reasons, jr.computed_at,
                j.id, j.title, j.description, j.location, j.salary_range, j.deadline,
                j.job_type, j.status, j.company_id, j.school_id,
                u.name AS company_name
         FROM job_recommendations jr
         JOIN jobs j ON j.id = jr.job_id
         LEFT JOIN users u ON u.id = j.company_id
         WHERE jr.user_id = $1 AND j.status = 'active'
         ORDER BY jr.score DESC, jr.computed_at DESC
         LIMIT $2`,
        [req.user.id, limit]
      );
    }

    res.json({
      recommendations: rows.rows.map((r) => ({
        job_id: r.id,
        score: r.score,
        reasons: r.reasons,
        computed_at: r.computed_at,
        job: {
          id: r.id,
          title: r.title,
          description: r.description,
          location: r.location,
          salary_range: r.salary_range,
          deadline: r.deadline,
          job_type: r.job_type,
          status: r.status,
          company_id: r.company_id,
          company_name: r.company_name,
          school_id: r.school_id,
        },
      })),
      scoring_factors: [
        'skill_overlap',
        'location_match',
        'deadline_boost',
        'major_fit',
        'freshness',
      ],
    });
  } catch (err) {
    console.error('recommendations/me error:', err);
    res.status(500).json({ error: 'Failed to load recommendations' });
  }
});

// POST /api/recommendations/recompute — self or school/cron (REQ-REC-005)
router.post('/recompute', auth, authorize('recommendations', 'read'), schoolScope, async (req, res) => {
  try {
    const cronSecret = process.env.RECOMMENDATION_CRON_SECRET;
    const isCron = cronSecret && req.get('x-cron-secret') === cronSecret;
    const targetUserId = req.body?.user_id ? Number(req.body.user_id) : req.user.id;
    const schoolWide = Boolean(req.body?.school_wide);

    if (schoolWide || (isCron && req.body?.all_schools)) {
      if (!isCron && !isSystemAdmin(req.user) && !isStaffAdmin(req.user)) {
        return forbidCrossSchool(res);
      }
      if (req.body?.all_schools && (isCron || isSystemAdmin(req.user))) {
        const results = await recommendations.recomputeAllActiveSchools();
        return res.json({ message: 'Recomputed all schools', results });
      }
      const schoolId = isSystemAdmin(req.user) && req.body?.school_id
        ? Number(req.body.school_id)
        : req.user.school_id;
      if (!schoolId) {
        return sendError(res, 400, 'VALIDATION', 'school_id required');
      }
      const result = await recommendations.recomputeSchool(schoolId);
      return res.json({ message: 'Recomputed school', result });
    }

    if (targetUserId !== req.user.id && !isSystemAdmin(req.user) && !isStaffAdmin(req.user)) {
      return forbidCrossSchool(res);
    }
    if (targetUserId !== req.user.id) {
      const u = await query('SELECT id, school_id FROM users WHERE id = $1', [targetUserId]);
      if (!u.rows.length) return sendError(res, 404, 'NOT_FOUND', 'User not found');
      if (!isSystemAdmin(req.user) && Number(u.rows[0].school_id) !== Number(req.user.school_id)) {
        return forbidCrossSchool(res);
      }
    }

    const result = await recommendations.recomputeForUser(targetUserId);
    res.json({ message: 'Recomputed', result });
  } catch (err) {
    console.error('recommendations/recompute error:', err);
    res.status(500).json({ error: 'Failed to recompute recommendations' });
  }
});

// POST /api/recommendations/feedback — P1 light capture (REQ-REC-006)
router.post('/feedback', auth, authorize('recommendations', 'read'), async (req, res) => {
  try {
    const { job_id: jobId, event } = req.body || {};
    if (!jobId || !['impression', 'click', 'apply'].includes(event)) {
      return sendError(res, 400, 'VALIDATION', 'job_id and event(impression|click|apply) required');
    }
    const job = await query('SELECT id, school_id FROM jobs WHERE id = $1', [jobId]);
    if (!job.rows.length) return sendError(res, 404, 'NOT_FOUND', 'Job not found');
    if (
      !isSystemAdmin(req.user)
      && job.rows[0].school_id != null
      && req.user.school_id != null
      && Number(job.rows[0].school_id) !== Number(req.user.school_id)
    ) {
      return forbidCrossSchool(res);
    }
    const result = await query(
      `INSERT INTO recommendation_feedback (user_id, job_id, event, school_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, jobId, event, req.user.school_id || job.rows[0].school_id]
    );
    res.status(201).json({ feedback: result.rows[0] });
  } catch (err) {
    console.error('recommendations/feedback error:', err);
    res.status(500).json({ error: 'Failed to record feedback' });
  }
});

module.exports = router;
