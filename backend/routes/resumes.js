'use strict';

const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { auth } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { schoolScope, assertSameSchool, forbidCrossSchool } = require('../middleware/schoolScope');
const { isSystemAdmin, isSchoolAdmin, canonicalRole } = require('../lib/roles');
const { sendError } = require('../lib/httpErrors');
const {
  loadResumeWithItems,
  replaceResumeItems,
  saveGeneratedFile,
  withTransaction,
} = require('../modules/documents/store');
const { renderResumePdf, previewHtml } = require('../modules/documents/resume');

const ALLOWED_SECTIONS = new Set([
  'experience', 'education', 'certificate', 'award',
  'language', 'skill', 'portfolio', 'intro',
]);
const ALLOWED_STATUS = new Set(['draft', 'published']);
const ALLOWED_TEMPLATES = new Set(['basic', 'compact']);

async function canReadResume(user, resume) {
  if (Number(resume.user_id) === Number(user.id)) return true;
  if (isSystemAdmin(user)) return true;
  if ((isSchoolAdmin(user) || user.user_type === 'teacher' || user.role === 'teacher')
      && assertSameSchool({ user }, resume.school_id)) {
    return true;
  }
  if (canonicalRole(user) === 'company') {
    const r = await query(
      `SELECT ja.id FROM job_applications ja
       JOIN jobs j ON j.id = ja.job_id
       WHERE ja.resume_id = $1 AND j.company_id = $2
       LIMIT 1`,
      [resume.id, user.id]
    );
    return r.rows.length > 0;
  }
  return false;
}

function canWriteResume(user, resume) {
  return Number(resume.user_id) === Number(user.id);
}

function sanitizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => item && ALLOWED_SECTIONS.has(item.section))
    .map((item, idx) => ({
      section: item.section,
      payload: item.payload && typeof item.payload === 'object' ? item.payload : {},
      sort_order: Number.isFinite(item.sort_order) ? item.sort_order : idx,
    }));
}

function clientResume(resume, items) {
  return { ...resume, items: items || [] };
}

async function defaultBasicInfo(userId) {
  const r = await query(
    `SELECT name, email, phone, school_name, major FROM users WHERE id = $1`,
    [userId]
  );
  const u = r.rows[0] || {};
  return {
    name: u.name || '',
    email: u.email || '',
    phone: u.phone || '',
    school_name: u.school_name || '',
    major: u.major || '',
  };
}

// GET /api/resumes
router.get('/', auth, authorize('resumes', 'read'), schoolScope, async (req, res) => {
  try {
    const requestedUserId = req.query.user_id ? Number(req.query.user_id) : null;
    let ownerId = req.user.id;
    if (requestedUserId && requestedUserId !== Number(req.user.id)) {
      const staff = isSystemAdmin(req.user) || isSchoolAdmin(req.user)
        || req.user.user_type === 'teacher' || req.user.role === 'teacher';
      if (!staff) return forbidCrossSchool(res);
      const target = await query('SELECT id, school_id FROM users WHERE id = $1', [requestedUserId]);
      if (!target.rows.length) return sendError(res, 404, 'NOT_FOUND', '사용자를 찾을 수 없습니다');
      if (!isSystemAdmin(req.user) && !assertSameSchool(req, target.rows[0].school_id)) {
        return forbidCrossSchool(res);
      }
      ownerId = requestedUserId;
    }

    const result = await query(
      `SELECT r.*,
              (SELECT COUNT(*)::int FROM resume_items i WHERE i.resume_id = r.id) AS item_count
       FROM resumes r
       WHERE r.user_id = $1
       ORDER BY r.is_primary DESC, r.updated_at DESC`,
      [ownerId]
    );
    res.json({ resumes: result.rows });
  } catch (error) {
    console.error('List resumes error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to list resumes');
  }
});

// POST /api/resumes
router.post('/', auth, authorize('resumes', 'write'), async (req, res) => {
  try {
    if (!req.user.school_id) {
      return sendError(res, 400, 'VALIDATION', '학교 소속이 없는 계정은 이력서를 만들 수 없습니다');
    }
    const title = (req.body.title && String(req.body.title).trim()) || '이력서';
    const templateCode = ALLOWED_TEMPLATES.has(req.body.template_code) ? req.body.template_code : 'basic';
    const status = ALLOWED_STATUS.has(req.body.status) ? req.body.status : 'draft';
    const basicInfo = req.body.basic_info && typeof req.body.basic_info === 'object'
      ? req.body.basic_info
      : await defaultBasicInfo(req.user.id);
    const summary = req.body.summary || null;
    const items = sanitizeItems(req.body.items);

    const existing = await query('SELECT id FROM resumes WHERE user_id = $1 LIMIT 1', [req.user.id]);
    const isPrimary = existing.rows.length === 0 || req.body.is_primary === true;

    const created = await withTransaction(async (client) => {
      if (isPrimary) {
        await client.query('UPDATE resumes SET is_primary = false WHERE user_id = $1', [req.user.id]);
      }
      const ins = await client.query(
        `INSERT INTO resumes (user_id, school_id, title, is_primary, status, version, template_code, basic_info, summary)
         VALUES ($1,$2,$3,$4,$5,1,$6,$7::jsonb,$8)
         RETURNING *`,
        [req.user.id, req.user.school_id, title, isPrimary, status, templateCode, JSON.stringify(basicInfo), summary]
      );
      const resume = ins.rows[0];
      await replaceResumeItems(client, resume.id, items);
      return resume;
    });

    const loaded = await loadResumeWithItems(created.id);
    res.status(201).json({ resume: clientResume(loaded.resume, loaded.items) });
  } catch (error) {
    console.error('Create resume error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to create resume');
  }
});

router.get('/:id/preview', auth, authorize('resumes', 'read'), async (req, res) => {
  try {
    const loaded = await loadResumeWithItems(req.params.id);
    if (!loaded) return sendError(res, 404, 'NOT_FOUND', '이력서를 찾을 수 없습니다');
    if (!(await canReadResume(req.user, loaded.resume))) return forbidCrossSchool(res);
    res.json({
      resume: clientResume(loaded.resume, loaded.items),
      html: previewHtml(loaded.resume, loaded.items),
    });
  } catch (error) {
    console.error('Preview resume error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to preview resume');
  }
});

router.post('/:id/primary', auth, authorize('resumes', 'write'), async (req, res) => {
  try {
    const loaded = await loadResumeWithItems(req.params.id);
    if (!loaded) return sendError(res, 404, 'NOT_FOUND', '이력서를 찾을 수 없습니다');
    if (!canWriteResume(req.user, loaded.resume)) return forbidCrossSchool(res);

    await withTransaction(async (client) => {
      await client.query('UPDATE resumes SET is_primary = false WHERE user_id = $1', [req.user.id]);
      await client.query(
        `UPDATE resumes SET is_primary = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [loaded.resume.id]
      );
    });
    const next = await loadResumeWithItems(loaded.resume.id);
    res.json({ resume: clientResume(next.resume, next.items) });
  } catch (error) {
    console.error('Primary resume error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to set primary resume');
  }
});

router.post('/:id/pdf', auth, authorize('resumes', 'read'), async (req, res) => {
  try {
    const loaded = await loadResumeWithItems(req.params.id);
    if (!loaded) return sendError(res, 404, 'NOT_FOUND', '이력서를 찾을 수 없습니다');
    if (!(await canReadResume(req.user, loaded.resume))) return forbidCrossSchool(res);

    const templateCode = ALLOWED_TEMPLATES.has(req.body?.template_code)
      ? req.body.template_code
      : loaded.resume.template_code;
    const resumeForPdf = { ...loaded.resume, template_code: templateCode };
    const buffer = await renderResumePdf(resumeForPdf, loaded.items);
    const file = await saveGeneratedFile({
      buffer,
      mime: 'application/pdf',
      kind: 'resume_pdf',
      schoolId: loaded.resume.school_id,
      ownerUserId: loaded.resume.user_id,
      originalName: `${loaded.resume.title || 'resume'}.pdf`,
    });
    await query(
      `INSERT INTO resume_documents (resume_id, file_id, template_code) VALUES ($1, $2, $3)`,
      [loaded.resume.id, file.id, templateCode]
    );

    const wantsBinary = String(req.headers.accept || '').includes('application/pdf')
      || req.query.download === '1';
    if (wantsBinary) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.original_name || 'resume.pdf')}`);
      return res.send(buffer);
    }
    res.status(201).json({
      file,
      document: { resume_id: loaded.resume.id, file_id: file.id, template_code: templateCode },
    });
  } catch (error) {
    console.error('Resume PDF error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to generate resume PDF');
  }
});

router.get('/:id', auth, authorize('resumes', 'read'), async (req, res) => {
  try {
    const loaded = await loadResumeWithItems(req.params.id);
    if (!loaded) return sendError(res, 404, 'NOT_FOUND', '이력서를 찾을 수 없습니다');
    if (!(await canReadResume(req.user, loaded.resume))) return forbidCrossSchool(res);
    res.json({ resume: clientResume(loaded.resume, loaded.items) });
  } catch (error) {
    console.error('Get resume error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to get resume');
  }
});

router.put('/:id', auth, authorize('resumes', 'write'), async (req, res) => {
  try {
    const loaded = await loadResumeWithItems(req.params.id);
    if (!loaded) return sendError(res, 404, 'NOT_FOUND', '이력서를 찾을 수 없습니다');
    if (!canWriteResume(req.user, loaded.resume)) return forbidCrossSchool(res);

    const title = req.body.title != null ? String(req.body.title).trim() : loaded.resume.title;
    const templateCode = ALLOWED_TEMPLATES.has(req.body.template_code)
      ? req.body.template_code
      : loaded.resume.template_code;
    const status = ALLOWED_STATUS.has(req.body.status) ? req.body.status : loaded.resume.status;
    const basicInfo = req.body.basic_info && typeof req.body.basic_info === 'object'
      ? req.body.basic_info
      : loaded.resume.basic_info;
    const summary = req.body.summary !== undefined ? req.body.summary : loaded.resume.summary;
    const bumpVersion = status === 'published' || loaded.resume.status === 'published';
    const items = req.body.items !== undefined ? sanitizeItems(req.body.items) : null;

    const updated = await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE resumes
         SET title = $1,
             template_code = $2,
             status = $3,
             basic_info = $4::jsonb,
             summary = $5,
             version = CASE WHEN $6 THEN version + 1 ELSE version END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $7
         RETURNING *`,
        [title || '이력서', templateCode, status, JSON.stringify(basicInfo || {}), summary, bumpVersion, loaded.resume.id]
      );
      if (items) await replaceResumeItems(client, loaded.resume.id, items);
      return result.rows[0];
    });

    const next = await loadResumeWithItems(updated.id);
    res.json({ resume: clientResume(next.resume, next.items) });
  } catch (error) {
    console.error('Update resume error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to update resume');
  }
});

router.delete('/:id', auth, authorize('resumes', 'write'), async (req, res) => {
  try {
    const loaded = await loadResumeWithItems(req.params.id);
    if (!loaded) return sendError(res, 404, 'NOT_FOUND', '이력서를 찾을 수 없습니다');
    if (!canWriteResume(req.user, loaded.resume)) return forbidCrossSchool(res);
    await query('DELETE FROM resumes WHERE id = $1', [loaded.resume.id]);
    res.json({ message: '이력서가 삭제되었습니다.' });
  } catch (error) {
    console.error('Delete resume error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to delete resume');
  }
});

module.exports = router;
