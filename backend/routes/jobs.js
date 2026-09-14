const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { auth, checkRole } = require('../middleware/auth');
const { sendError } = require('../lib/httpErrors');
const { forbidCrossSchool } = require('../middleware/schoolScope');

// Get all jobs (with filters)
router.get('/', async (req, res) => {
  try {
    const { 
      search, 
      location, 
      job_type, 
      experience_level,
      status = 'active',
      page = 1, 
      limit = 20 
    } = req.query;

    // status=all means no status filter (admin use)
    const statusAll = status === 'all';

    // GREATEST: job_applications 실제 COUNT vs 저장된 applications_count 중 큰 값 사용
    // → job_applications 테이블이 비어있어도 기존 누적 카운트 보존
    let queryText = `
      SELECT j.*,
             u.name as company_name,
             cp.logo_url as company_logo,
             GREATEST(j.applications_count, COALESCE(ja_cnt.cnt, 0)) AS applications_count
      FROM jobs j
      JOIN users u ON j.company_id = u.id
      LEFT JOIN company_profiles cp ON u.id = cp.user_id
      LEFT JOIN (
        SELECT job_id, COUNT(*) AS cnt
        FROM job_applications
        GROUP BY job_id
      ) ja_cnt ON j.id = ja_cnt.job_id
      WHERE ${statusAll ? '1=1' : 'j.status = $1'}
    `;
    const params = statusAll ? [] : [status];
    let paramCount = statusAll ? 0 : 1;

    if (search) {
      paramCount++;
      queryText += ` AND (j.title ILIKE $${paramCount} OR j.description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    if (location) {
      paramCount++;
      queryText += ` AND j.location ILIKE $${paramCount}`;
      params.push(`%${location}%`);
    }

    if (job_type) {
      paramCount++;
      queryText += ` AND j.job_type = $${paramCount}`;
      params.push(job_type);
    }

    if (experience_level) {
      paramCount++;
      queryText += ` AND j.experience_level = $${paramCount}`;
      params.push(experience_level);
    }

    queryText += ` ORDER BY j.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const result = await query(queryText, params);

    // Get total count
    const countResult = await query(
      statusAll ? 'SELECT COUNT(*) FROM jobs' : 'SELECT COUNT(*) FROM jobs WHERE status = $1',
      statusAll ? [] : [status]
    );

    res.json({
      jobs: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({ error: 'Failed to get jobs' });
  }
});

// Sync applications_count from actual job_applications (admin only)
// GREATEST 사용 → 기존 값보다 실제 COUNT가 많을 때만 업데이트 (기존 데이터 보존)
router.post('/admin/sync-counts', auth, checkRole('admin'), async (req, res) => {
  try {
    const result = await query(`
      UPDATE jobs j
      SET applications_count = GREATEST(
        j.applications_count,
        (SELECT COUNT(*) FROM job_applications ja WHERE ja.job_id = j.id)
      )
      RETURNING id, title, applications_count
    `);
    res.json({
      message: `${result.rows.length}개 공고의 지원자 수가 동기화되었습니다.`,
      updated: result.rows
    });
  } catch (error) {
    console.error('Sync counts error:', error);
    res.status(500).json({ error: 'Failed to sync counts' });
  }
});

// Get single job
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Increment views
    await query('UPDATE jobs SET views_count = views_count + 1 WHERE id = $1', [id]);

    const result = await query(
      `SELECT j.*,
              u.name as company_name, u.email as company_email, u.phone as company_phone,
              cp.logo_url, cp.website, cp.description as company_description,
              GREATEST(j.applications_count, COALESCE((
                SELECT COUNT(*) FROM job_applications ja WHERE ja.job_id = j.id
              ), 0)) AS applications_count
       FROM jobs j
       JOIN users u ON j.company_id = u.id
       LEFT JOIN company_profiles cp ON u.id = cp.user_id
       WHERE j.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ job: result.rows[0] });
  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({ error: 'Failed to get job' });
  }
});

// Create job (company, teacher, admin)
router.post('/', auth, checkRole('company', 'admin', 'teacher'), async (req, res) => {
  try {
    const {
      title,
      description,
      requirements,
      location,
      job_type,
      salary_range,
      experience_level,
      headcount,
      deadline
    } = req.body;

    // headcount 컬럼 존재 여부 확인 후 동적으로 INSERT
    const colCheck = await query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name='jobs' AND column_name='headcount'`
    );
    const hasHeadcount = colCheck.rows.length > 0;

    let result;
    if (hasHeadcount) {
      result = await query(
        `INSERT INTO jobs 
         (company_id, title, description, requirements, location, job_type, 
          salary_range, experience_level, headcount, deadline)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [req.user.id, title, description, requirements, location, job_type,
         salary_range, experience_level, headcount || 1, deadline]
      );
    } else {
      result = await query(
        `INSERT INTO jobs 
         (company_id, title, description, requirements, location, job_type, 
          salary_range, experience_level, deadline)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [req.user.id, title, description, requirements, location, job_type,
         salary_range, experience_level, deadline]
      );
    }

    res.status(201).json({
      message: 'Job created successfully',
      job: result.rows[0]
    });
  } catch (error) {
    console.error('Create job error:', error);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// Update job
router.put('/:id', auth, checkRole('company', 'admin', 'teacher'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      requirements,
      location,
      job_type,
      salary_range,
      experience_level,
      headcount,
      deadline,
      status
    } = req.body;

    // Check ownership
    const jobCheck = await query(
      'SELECT company_id FROM jobs WHERE id = $1',
      [id]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (jobCheck.rows[0].company_id !== req.user.id && req.user.user_type !== 'admin' && req.user.user_type !== 'teacher') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const result = await query(
      `UPDATE jobs 
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           requirements = COALESCE($3, requirements),
           location = COALESCE($4, location),
           job_type = COALESCE($5, job_type),
           salary_range = COALESCE($6, salary_range),
           experience_level = COALESCE($7, experience_level),
           headcount = COALESCE($8, headcount),
           deadline = COALESCE($9, deadline),
           status = COALESCE($10, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $11
       RETURNING *`,
      [title, description, requirements, location, job_type, salary_range,
       experience_level, headcount, deadline, status, id]
    );

    res.json({
      message: 'Job updated successfully',
      job: result.rows[0]
    });
  } catch (error) {
    console.error('Update job error:', error);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

// Delete job
router.delete('/:id', auth, checkRole('company', 'admin', 'teacher'), async (req, res) => {
  try {
    const { id } = req.params;

    // Check ownership
    const jobCheck = await query(
      'SELECT company_id FROM jobs WHERE id = $1',
      [id]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (jobCheck.rows[0].company_id !== req.user.id && req.user.user_type !== 'admin' && req.user.user_type !== 'teacher') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await query('DELETE FROM jobs WHERE id = $1', [id]);

    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

// Apply for job
router.post('/:id/apply', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { cover_letter, resume_url } = req.body;
    let resumeId = req.body.resume_id ? Number(req.body.resume_id) : null;

    // Check if already applied
    const existing = await query(
      'SELECT id FROM job_applications WHERE job_id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Already applied to this job' });
    }

    // Check if job exists and is active
    const jobCheck = await query(
      'SELECT id, status FROM jobs WHERE id = $1',
      [id]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (jobCheck.rows[0].status !== 'active') {
      return res.status(400).json({ error: 'Job is not active' });
    }

    if (!resumeId) {
      const primary = await query(
        `SELECT id FROM resumes WHERE user_id = $1 AND is_primary = true LIMIT 1`,
        [req.user.id]
      );
      resumeId = primary.rows[0]?.id || null;
    }

    let storedResumeUrl = resume_url || null;
    if (resumeId) {
      const resume = await query(
        `SELECT id, user_id, school_id FROM resumes WHERE id = $1`,
        [resumeId]
      );
      if (!resume.rows.length) {
        return sendError(res, 404, 'NOT_FOUND', '이력서를 찾을 수 없습니다');
      }
      if (Number(resume.rows[0].user_id) !== Number(req.user.id)) {
        return forbidCrossSchool(res);
      }
      const latestDoc = await query(
        `SELECT file_id FROM resume_documents WHERE resume_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [resumeId]
      );
      if (latestDoc.rows.length) {
        storedResumeUrl = storedResumeUrl || `/api/files/${latestDoc.rows[0].file_id}`;
      }
    }

    const result = await query(
      `INSERT INTO job_applications (job_id, user_id, cover_letter, resume_url, resume_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, req.user.id, cover_letter, storedResumeUrl, resumeId]
    );

    // Update applications count
    await query(
      'UPDATE jobs SET applications_count = applications_count + 1 WHERE id = $1',
      [id]
    );

    res.status(201).json({
      message: 'Application submitted successfully',
      application: result.rows[0]
    });
  } catch (error) {
    console.error('Apply job error:', error);
    res.status(500).json({ error: 'Failed to apply' });
  }
});

// Get applicants for a job (admin only)
router.get('/:id/applicants', auth, checkRole('admin', 'company'), async (req, res) => {
  try {
    const { id } = req.params;

    // Company can only see their own job applicants; admin sees all
    if (req.user.user_type === 'company') {
      const jobCheck = await query('SELECT company_id FROM jobs WHERE id = $1', [id]);
      if (jobCheck.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
      if (jobCheck.rows[0].company_id !== req.user.id)
        return res.status(403).json({ error: 'Not authorized' });
    }

    const result = await query(
      `SELECT ja.id, ja.status as application_status, ja.applied_at, ja.cover_letter,
              ja.resume_id, ja.resume_url,
              u.id as user_id, u.name, u.email, u.phone, u.school_name, u.major,
              u.user_type, u.graduation_year
       FROM job_applications ja
       JOIN users u ON ja.user_id = u.id
       WHERE ja.job_id = $1
       ORDER BY ja.applied_at DESC`,
      [id]
    );

    res.json({ applicants: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Get applicants error:', error);
    res.status(500).json({ error: 'Failed to get applicants' });
  }
});

// Get my applications
router.get('/my/applications', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT ja.*, j.title, j.location, j.job_type,
              u.name as company_name
       FROM job_applications ja
       JOIN jobs j ON ja.job_id = j.id
       JOIN users u ON j.company_id = u.id
       WHERE ja.user_id = $1
       ORDER BY ja.applied_at DESC`,
      [req.user.id]
    );

    res.json({ applications: result.rows });
  } catch (error) {
    console.error('Get applications error:', error);
    res.status(500).json({ error: 'Failed to get applications' });
  }
});

// Admin: 시드/샘플 채용공고 삭제 (테스트 계정의 공고 + 만료 공고 정리)
router.delete('/admin/clear-sample-jobs', auth, checkRole('admin'), async (req, res) => {
  try {
    // 시드 계정 이메일로 등록된 샘플 채용공고 삭제
    const seedEmails = [
      'hr@samsung.com',
      'recruit@hyundai.com',
      'jobs@posco.com',
      'company@jjob.com',   // create-test-accounts 샘플
      'recruit@hyundai.com'
    ];

    const placeholders = seedEmails.map((_, i) => `$${i + 1}`).join(',');
    const result = await query(
      `DELETE FROM jobs
       WHERE company_id IN (
         SELECT id FROM users WHERE email IN (${placeholders})
       )
       RETURNING id, title`,
      seedEmails
    );

    res.json({
      message: `샘플 채용공고 ${result.rowCount}건 삭제 완료`,
      deleted: result.rows
    });
  } catch (error) {
    console.error('Clear sample jobs error:', error);
    res.status(500).json({ error: 'Failed to clear sample jobs' });
  }
});

module.exports = router;
