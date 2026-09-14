'use strict';

const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { auth } = require('../middleware/auth');
const { schoolScope, assertSameSchool, forbidCrossSchool } = require('../middleware/schoolScope');
const { isSystemAdmin, isSchoolAdmin, canonicalRole } = require('../lib/roles');
const { sendError } = require('../lib/httpErrors');
const { getStorage } = require('../modules/storage');

async function canReadFile(user, file) {
  if (Number(file.owner_user_id) === Number(user.id)) return true;
  if (isSystemAdmin(user)) return true;

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

  return assertSameSchool({ user }, file.school_id);
}

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
