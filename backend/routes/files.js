'use strict';

const express = require('express');
const multer = require('multer');
const router = express.Router();
const { query } = require('../config/database');
const { auth } = require('../middleware/auth');
const { schoolScope, assertSameSchool, forbidCrossSchool } = require('../middleware/schoolScope');
const { isSystemAdmin, isSchoolAdmin, canonicalRole } = require('../lib/roles');
const { sendError } = require('../lib/httpErrors');
const { getStorage } = require('../modules/storage');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const ALLOWED_KINDS = new Set([
  'attachment',
  'school_logo',
]);

async function canReadFile(user, file) {
  if (Number(file.owner_user_id) === Number(user.id)) return true;
  if (isSystemAdmin(user)) return true;

  if (file.kind === 'school_logo') {
    if (file.school_id == null) {
      return isSystemAdmin(user) || Number(file.owner_user_id) === Number(user.id);
    }
    if (user.school_id != null && Number(user.school_id) === Number(file.school_id)) {
      return true;
    }
    return false;
  }

  if (file.kind === 'attachment') {
    if (user.school_id != null && file.school_id != null
        && Number(user.school_id) === Number(file.school_id)) {
      return true;
    }
    return false;
  }

  if (file.kind === 'resume_pdf' && file.resume_id) {
    if ((isSchoolAdmin(user) || user.user_type === 'teacher' || user.role === 'teacher')
        && assertSameSchool({ user }, file.school_id)) {
      return true;
    }
    if (canonicalRole(user) === 'company') {
      const r = await query(
        `SELECT ja.id FROM job_applications ja
         JOIN jobs j ON j.id = ja.job_id
         WHERE ja.resume_id = $1 AND j.company_id = $2
         LIMIT 1`,
        [file.resume_id, user.id]
      );
      return r.rows.length > 0;
    }
    return false;
  }

  if ((file.kind === 'counseling_pdf' || file.kind === 'counseling_docx') && file.journal_id) {
    const j = await query('SELECT * FROM counseling_journals WHERE id = $1', [file.journal_id]);
    const journal = j.rows[0];
    if (!journal) return false;
    if (isSchoolAdmin(user) && assertSameSchool({ user }, journal.school_id)) return true;
    if ((user.user_type === 'teacher' || user.role === 'teacher')
        && Number(journal.teacher_id) === Number(user.id)) return true;
    if (Number(journal.student_id) === Number(user.id) && journal.is_private === false) return true;
    return false;
  }

  return false;
}

// POST /api/files — community/trip attachment or school_logo (REQ-COM-002/003, REQ-IAM-001)
router.post('/', auth, schoolScope, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return sendError(res, 400, 'VALIDATION', 'file required (multipart field "file")');
    }
    const kindRaw = (req.body?.kind || req.query?.kind || 'attachment').toString();
    const kind = ALLOWED_KINDS.has(kindRaw) ? kindRaw : null;
    if (!kind) {
      return sendError(res, 400, 'VALIDATION', 'kind must be attachment or school_logo');
    }

    if (kind === 'school_logo') {
      const canUploadLogo = isSystemAdmin(req.user) || isSchoolAdmin(req.user);
      if (!canUploadLogo) {
        return sendError(res, 403, 'FORBIDDEN', '학교 로고는 관리자만 업로드할 수 있습니다');
      }
      const mime = req.file.mimetype || '';
      if (!mime.startsWith('image/')) {
        return sendError(res, 400, 'VALIDATION', '학교 로고는 이미지 파일이어야 합니다');
      }
    }

    const originalName = req.file.originalname || 'attachment';
    const mime = req.file.mimetype || 'application/octet-stream';
    const schoolIdForStore = kind === 'school_logo' && isSystemAdmin(req.user)
      ? (req.user.school_id || null)
      : (req.user.school_id || null);

    const stored = await getStorage().put({
      buffer: req.file.buffer,
      mime,
      kind,
      schoolId: schoolIdForStore,
      originalName,
    });
    const result = await query(
      `INSERT INTO files (school_id, owner_user_id, bucket_key, mime, size, kind, original_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, school_id, owner_user_id, mime, size, kind, original_name, created_at`,
      [
        schoolIdForStore,
        req.user.id,
        stored.bucketKey,
        mime,
        stored.size,
        kind,
        originalName,
      ]
    );
    res.status(201).json({ file: result.rows[0] });
  } catch (error) {
    console.error('Upload file error:', error);
    if (error.code === 'NOT_CONFIGURED') {
      return sendError(res, 503, 'NOT_CONFIGURED', error.message);
    }
    return sendError(res, 500, 'INTERNAL', 'Failed to upload file');
  }
});

router.get('/:id', auth, schoolScope, async (req, res) => {
  try {
    const result = await query(
      `SELECT f.*,
              rd.resume_id,
              cd.journal_id
       FROM files f
       LEFT JOIN resume_documents rd ON rd.file_id = f.id
       LEFT JOIN counseling_documents cd ON cd.file_id = f.id
       WHERE f.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) {
      return sendError(res, 404, 'NOT_FOUND', '파일을 찾을 수 없습니다');
    }
    const file = result.rows[0];
    if (!(await canReadFile(req.user, file))) {
      return forbidCrossSchool(res);
    }

    const buffer = await getStorage().get(file.bucket_key);
    res.setHeader('Content-Type', file.mime || 'application/octet-stream');
    res.setHeader('Content-Length', buffer.length);
    const download = req.query.download === '1' || req.query.download === 'true';
    const name = file.original_name || `file-${file.id}`;
    res.setHeader(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`
    );
    return res.send(buffer);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return sendError(res, 404, 'NOT_FOUND', '저장된 파일을 찾을 수 없습니다');
    }
    console.error('Get file error:', error);
    return sendError(res, 500, 'INTERNAL', 'Failed to get file');
  }
});

module.exports = router;
