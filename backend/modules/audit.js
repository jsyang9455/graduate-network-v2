const { query } = require('../config/database');

async function writeAudit({ actorId, schoolId, action, resource, payload, ip }) {
  try {
    await query(
      `INSERT INTO audit_logs (actor_id, school_id, action, resource, payload, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [actorId || null, schoolId || null, action, resource, payload ? JSON.stringify(payload) : null, ip || null]
    );
  } catch (err) {
    if (err.code === '42P01') {
      console.warn('audit_logs table not ready, skip:', action, resource);
      return;
    }
    console.error('Audit log write failed:', err.message);
  }
}

function requestIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.connection?.remoteAddress || null;
}

module.exports = { writeAudit, requestIp };
