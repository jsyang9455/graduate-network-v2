const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { auth, optionalAuth, checkRole } = require('../middleware/auth');
const { sendError } = require('../lib/httpErrors');
const { forbidCrossSchool } = require('../middleware/schoolScope');
const { isSystemAdmin } = require('../lib/roles');
const { canSeeJob, canManageJob, appendJobSchoolFilter } = require('../lib/jobAccess');
const { STATUS_LABELS, isValidStatus, canTransition } = require('../lib/applicationStatus');
const { assertCompanyCanManageJobs } = require('../lib/companyApproval');
const notify = require('../modules/notify');

async function loadJobById(id) {
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
  return result.rows[0] || null;
}

function denyJobAccess(res, user) {
  if (!user) {
    return sendError(res, 401, 'UNAUTHENTICATED', 'Authentication required');
  }
  return forbidCrossSchool(res);
}

async function loadApplicationWithJob(id) {
  const result = await query(
    `SELECT ja.*,
            j.title AS job_title, j.company_id, j.school_id AS job_school_id, j.status AS job_status,
            u.name AS applicant_name, u.email AS applicant_email, u.phone AS applicant_phone,
            u.school_name AS applicant_school_name, u.major AS applicant_major
     FROM job_applications ja
     JOIN jobs j ON ja.job_id = j.id
     JOIN users u ON ja.user_id = u.id
     WHERE ja.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

// Get all jobs (with filters) — school-scoped when authenticated (REQ-IAM-009)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      search,
      location,
      job_type,
      experience_level,
      status = 'active',
      page = 1,
      limit = 20,
    } = req.query;

    const statusAll = status === 'all';

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

    const scoped = appendJobSchoolFilter(queryText, params, paramCount, req.user);
    queryText = scoped.queryText;
    paramCount = scoped.paramCount;

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
    params.push(parseInt(limit, 10), (parseInt(page, 10) - 1) * parseInt(limit, 10));

    const result = await query(queryText, params);

    let countSql = statusAll ? 'SELECT COUNT(*) FROM jobs j WHERE 1=1' : 'SELECT COUNT(*) FROM jobs j WHERE j.status = $1';
    const countParams = statusAll ? [] : [status];
    let countParamCount = statusAll ? 0 : 1;
    const counted = appendJobSchoolFilter(countSql, countParams, countParamCount, req.user);

    const countResult = await query(counted.queryText, countParams);

    res.json({
      jobs: result.rows,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: parseInt(countResult.rows[0].count, 10),
        pages: Math.ceil(countResult.rows[0].count / parseInt(limit, 10)),
      },
    });
  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({ error: 'Failed to get jobs' });
  }
});

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
      updated: result.rows,
    });
  } catch (error) {
    console.error('Sync counts error:', error);
    res.status(500).json({ error: 'Failed to sync counts' });
  }
});

router.delete('/admin/clear-sample-jobs', auth, checkRole('admin'), async (req, res) => {
  try {
    const seedEmails = [
      'hr@samsung.com',
      'recruit@hyundai.com',
      'jobs@posco.com',
      'company@jjob.com',
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
      deleted: result.rows,
    });
  } catch (error) {
    console.error('Clear sample jobs error:', error);
    res.status(500).json({ error: 'Failed to clear sample jobs' });
  }
});

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

// My job scraps (REQ-REC-002 signal + bookmark)
router.get('/scraps/me', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT j.*, u.name AS company_name, s.created_at AS scraped_at
       FROM job_scraps s
       JOIN jobs j ON j.id = s.job_id
       JOIN users u ON u.id = j.company_id
       WHERE s.user_id = $1
       ORDER BY s.created_at DESC`,
      [req.user.id]
    );
    res.json({ jobs: result.rows, scraps: result.rows });
  } catch (error) {
    console.error('Get job scraps error:', error);
    res.status(500).json({ error: 'Failed to get job scraps' });
  }
});

// REQ-JOB-003 — support status workflow
router.patch('/applications/:id/status', auth, checkRole('company', 'admin', 'teacher', 'school_admin'), async (req, res) => {
  try {
    const nextStatus = req.body && req.body.status;
    if (!isValidStatus(nextStatus)) {
      return sendError(res, 400, 'VALIDATION', '유효하지 않은 지원 상태입니다');
    }

    const application = await loadApplicationWithJob(req.params.id);
    if (!application) {
      return sendError(res, 404, 'NOT_FOUND', '지원 내역을 찾을 수 없습니다');
    }

    const job = {
      id: application.job_id,
      company_id: application.company_id,
      school_id: application.job_school_id,
    };
    if (!canManageJob(req.user, job)) {
      return forbidCrossSchool(res);
    }

    if (application.status === nextStatus) {
      return res.json({
        message: 'Application status unchanged',
        application,
      });
    }

    if (!canTransition(application.status, nextStatus)) {
      return sendError(res, 400, 'VALIDATION', `${STATUS_LABELS[application.status]}에서 ${STATUS_LABELS[nextStatus]}(으)로 변경할 수 없습니다`);
    }

    const updated = await query(
      `UPDATE job_applications SET status = $1 WHERE id = $2 RETURNING *`,
      [nextStatus, application.id]
    );

    const label = STATUS_LABELS[nextStatus];
    await notify.emit('JOB_APPLICATION_STATUS', {
      userId: application.user_id,
      type: 'job_status',
      title: `지원 결과가 변경되었습니다 (${label})`,
      message: `「${application.job_title}」 공고 지원 상태가 ${label}(으)로 변경되었습니다.`,
      link: '/jobs.html',
      schoolId: application.job_school_id,
      payload: {
        application_id: application.id,
        job_id: application.job_id,
        status: nextStatus,
      },
    });

    res.json({
      message: 'Application status updated',
      application: updated.rows[0],
    });
  } catch (error) {
    console.error('Patch application status error:', error);
    res.status(500).json({ error: 'Failed to update application status' });
  }
});

router.get('/applications/:id', auth, async (req, res) => {
  try {
    const application = await loadApplicationWithJob(req.params.id);
    if (!application) {
      return sendError(res, 404, 'NOT_FOUND', '지원 내역을 찾을 수 없습니다');
    }
    const job = {
      id: application.job_id,
      company_id: application.company_id,
      school_id: application.job_school_id,
    };
    const isOwner = Number(application.user_id) === Number(req.user.id);
    if (!isOwner && !canManageJob(req.user, job)) {
      return forbidCrossSchool(res);
    }
    res.json({ application });
  } catch (error) {
    console.error('Get application error:', error);
    res.status(500).json({ error: 'Failed to get application' });
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const job = await loadJobById(id);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!canSeeJob(req.user, job)) {
      return denyJobAccess(res, req.user);
    }

    await query('UPDATE jobs SET views_count = views_count + 1 WHERE id = $1', [id]);
    const refreshed = await loadJobById(id);
    res.json({ job: refreshed });
  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({ error: 'Failed to get job' });
  }
});

router.post('/', auth, checkRole('company', 'admin', 'teacher', 'school_admin'), async (req, res) => {
  try {
    if (!(await assertCompanyCanManageJobs(res, req.user))) return;

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
      school_id,
    } = req.body;

    let schoolId = req.user.school_id || null;
    if (isSystemAdmin(req.user) && school_id) {
      schoolId = school_id;
    }
    if (!schoolId && !isSystemAdmin(req.user)) {
      return res.status(400).json({
        error: 'school_id is required for job posting',
        code: 'VALIDATION',
      });
    }

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
          salary_range, experience_level, headcount, deadline, school_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [req.user.id, title, description, requirements, location, job_type,
          salary_range, experience_level, headcount || 1, deadline, schoolId]
      );
    } else {
      result = await query(
        `INSERT INTO jobs
         (company_id, title, description, requirements, location, job_type,
          salary_range, experience_level, deadline, school_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [req.user.id, title, description, requirements, location, job_type,
          salary_range, experience_level, deadline, schoolId]
      );
    }

    res.status(201).json({
      message: 'Job created successfully',
      job: result.rows[0],
    });
  } catch (error) {
    console.error('Create job error:', error);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

router.put('/:id', auth, checkRole('company', 'admin', 'teacher', 'school_admin'), async (req, res) => {
  try {
    if (!(await assertCompanyCanManageJobs(res, req.user))) return;

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
      status,
    } = req.body;

    const jobCheck = await query(
      'SELECT id, company_id, school_id FROM jobs WHERE id = $1',
      [id]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!canManageJob(req.user, jobCheck.rows[0])) {
      return forbidCrossSchool(res);
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
      job: result.rows[0],
    });
  } catch (error) {
    console.error('Update job error:', error);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

router.delete('/:id', auth, checkRole('company', 'admin', 'teacher', 'school_admin'), async (req, res) => {
  try {
    if (!(await assertCompanyCanManageJobs(res, req.user))) return;

    const { id } = req.params;

    const jobCheck = await query(
      'SELECT id, company_id, school_id FROM jobs WHERE id = $1',
      [id]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (!canManageJob(req.user, jobCheck.rows[0])) {
      return forbidCrossSchool(res);
    }

    await query('DELETE FROM jobs WHERE id = $1', [id]);

    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

// Scrap / bookmark job (REQ-REC-002)
router.post('/:id/scrap', auth, async (req, res) => {
  try {
    const job = await loadJobById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!canSeeJob(req.user, job)) return forbidCrossSchool(res);
    if (job.status !== 'active') {
      return res.status(400).json({ error: 'Cannot scrap inactive job' });
    }
    await query(
      `INSERT INTO job_scraps (user_id, job_id, school_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, job_id) DO NOTHING`,
      [req.user.id, job.id, req.user.school_id || job.school_id]
    );
    res.status(201).json({ message: 'Job scraped', scraped: true });
  } catch (error) {
    console.error('Scrap job error:', error);
    res.status(500).json({ error: 'Failed to scrap job' });
  }
});

router.delete('/:id/scrap', auth, async (req, res) => {
  try {
    const job = await loadJobById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!canSeeJob(req.user, job)) return forbidCrossSchool(res);
    await query(
      'DELETE FROM job_scraps WHERE user_id = $1 AND job_id = $2',
      [req.user.id, job.id]
    );
    res.json({ message: 'Scrap removed', scraped: false });
  } catch (error) {
    console.error('Unscrap job error:', error);
    res.status(500).json({ error: 'Failed to remove scrap' });
  }
});

router.post('/:id/apply', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { cover_letter, resume_url } = req.body;
    let resumeId = req.body.resume_id ? Number(req.body.resume_id) : null;

    const existing = await query(
      'SELECT id FROM job_applications WHERE job_id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Already applied to this job' });
    }

    const jobCheck = await query(
      'SELECT id, status, company_id, school_id, title FROM jobs WHERE id = $1',
      [id]
    );

    if (jobCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = jobCheck.rows[0];
    if (!canSeeJob(req.user, job)) {
      return forbidCrossSchool(res);
    }

    if (job.status !== 'active') {
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

    await query(
      'UPDATE jobs SET applications_count = applications_count + 1 WHERE id = $1',
      [id]
    );

    await notify.emit('JOB_APPLICATION_RECEIVED', {
      userId: job.company_id,
      type: 'job_apply',
      title: '새 지원자가 있습니다',
      message: `「${job.title}」 공고에 새로운 지원이 접수되었습니다.`,
      link: `/applicant-detail.html?id=${result.rows[0].id}`,
      schoolId: job.school_id,
      payload: { application_id: result.rows[0].id, job_id: job.id },
    });

    res.status(201).json({
      message: 'Application submitted successfully',
      application: result.rows[0],
    });
  } catch (error) {
    console.error('Apply job error:', error);
    res.status(500).json({ error: 'Failed to apply' });
  }
});

router.get('/:id/applicants', auth, checkRole('admin', 'company', 'teacher', 'school_admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const jobCheck = await query('SELECT id, company_id, school_id FROM jobs WHERE id = $1', [id]);
    if (jobCheck.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    if (!canManageJob(req.user, jobCheck.rows[0])) {
      return forbidCrossSchool(res);
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

module.exports = router;
