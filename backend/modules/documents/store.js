'use strict';

const { query, getClient } = require('../../config/database');
const { getStorage } = require('../storage');

async function saveGeneratedFile({
  buffer,
  mime,
  kind,
  schoolId,
  ownerUserId,
  originalName,
}) {
  const stored = await getStorage().put({
    buffer,
    mime,
    kind,
    schoolId,
    originalName,
  });
  const result = await query(
    `INSERT INTO files (school_id, owner_user_id, bucket_key, mime, size, kind, original_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [schoolId || null, ownerUserId || null, stored.bucketKey, mime, stored.size, kind, originalName || null]
  );
  return result.rows[0];
}

async function replaceResumeItems(client, resumeId, items) {
  await client.query('DELETE FROM resume_items WHERE resume_id = $1', [resumeId]);
  const list = Array.isArray(items) ? items : [];
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (!item || !item.section) continue;
    await client.query(
      `INSERT INTO resume_items (resume_id, section, payload, sort_order)
       VALUES ($1, $2, $3::jsonb, $4)`,
      [resumeId, item.section, JSON.stringify(item.payload || {}), item.sort_order ?? i]
    );
  }
}

async function loadResumeWithItems(id) {
  const resumeResult = await query('SELECT * FROM resumes WHERE id = $1', [id]);
  if (!resumeResult.rows.length) return null;
  const itemsResult = await query(
    `SELECT * FROM resume_items WHERE resume_id = $1 ORDER BY sort_order ASC, id ASC`,
    [id]
  );
  return { resume: resumeResult.rows[0], items: itemsResult.rows };
}

async function withTransaction(fn) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  saveGeneratedFile,
  replaceResumeItems,
  loadResumeWithItems,
  withTransaction,
};
