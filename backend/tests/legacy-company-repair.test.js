'use strict';

/**
 * Regression: legacy company seed without profile / school_id
 * (TEST-ACCOUNTS company@jjob.com gap found in persona E2E campaign)
 * REQ-JOB-007 / REQ-IAM-004
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'legacy-company-repair-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '1d';
process.env.DISABLE_CRON = '1';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const { query, pool } = require('../config/database');
const { applyPendingMigrations } = require('../scripts/apply-migrations');
const app = require('../server');

let server;
let baseUrl;
const PASSWORD = 'password123';
const EMAIL = `qa.legacy.company.${Date.now()}@jjob.test`;

async function jsonRequest(method, pathName, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${pathName}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

describe('Legacy company seed repair (018)', { timeout: 120000 }, () => {
  let userId;

  before(async () => {
    await applyPendingMigrations();
    const school = await query(
      `SELECT id, name FROM schools WHERE status = 'active'
       ORDER BY CASE WHEN name = '전주공업고등학교' THEN 0 ELSE 1 END, id LIMIT 1`
    );
    assert.ok(school.rows.length, 'need an active school');

    const hash = await bcrypt.hash(PASSWORD, 10);
    const user = await query(
      `INSERT INTO users (email, password_hash, name, user_type, school_id, is_active)
       VALUES ($1, $2, '레거시기업', 'company', NULL, true) RETURNING id`,
      [EMAIL, hash]
    );
    userId = user.rows[0].id;

    // Simulate broken TEST-ACCOUNTS state: company user, no profile, null school
    await query(`DELETE FROM company_profiles WHERE user_id = $1`, [userId]);

    // Re-apply repair SQL body (idempotent fragment from 018)
    const repairSql = fs.readFileSync(
      path.join(__dirname, '../../database/migrations/018_v2_legacy_company_seed_repair.sql'),
      'utf8'
    );
    // Strip is not needed — applyPendingMigrations already ran 018 once;
    // re-run the statements for this orphan (same SQL is safe).
    await pool.query(repairSql);

    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await query(`DELETE FROM jobs WHERE company_id = $1`, [userId]);
    await query(`DELETE FROM company_profiles WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM users WHERE id = $1`, [userId]);
  });

  test('null school_id company is bound to default school after repair', async () => {
    const row = await query(`SELECT school_id FROM users WHERE id = $1`, [userId]);
    assert.ok(row.rows[0].school_id, 'school_id should be set');
  });

  test('company@jjob.com DX: if present, has approved profile (018)', async () => {
    const row = await query(
      `SELECT u.school_id, cp.approval_status
       FROM users u
       LEFT JOIN company_profiles cp ON cp.user_id = u.id
       WHERE u.email = 'company@jjob.com'`
    );
    if (!row.rows.length) {
      // optional fixture — skip when not seeded
      return;
    }
    assert.ok(row.rows[0].school_id);
    assert.equal(row.rows[0].approval_status, 'approved');
  });

  test('GET /company-profile returns NOT_FOUND code when still missing', async () => {
    // Our repaired orphan may still lack profile (018 only inserts for company@jjob.com)
    const login = await jsonRequest('POST', '/api/auth/login', {
      body: { email: EMAIL, password: PASSWORD },
    });
    assert.equal(login.status, 200);
    const get = await jsonRequest('GET', '/api/users/company-profile', {
      token: login.data.token,
    });
    // After school bind only — profile still missing unless we upsert
    if (get.status === 404) {
      assert.equal(get.data.code, 'NOT_FOUND');
    } else {
      assert.equal(get.status, 200);
    }
  });

  test('PUT profile then school-bound approved path: pending cannot post until approved', async () => {
    const login = await jsonRequest('POST', '/api/auth/login', {
      body: { email: EMAIL, password: PASSWORD },
    });
    const put = await jsonRequest('PUT', '/api/users/company-profile', {
      token: login.data.token,
      body: { company_name: '레거시수리기업', industry: '제조' },
    });
    assert.equal(put.status, 200, JSON.stringify(put.data));
    assert.equal(put.data.profile.approval_status, 'pending');

    const job = await jsonRequest('POST', '/api/jobs', {
      token: login.data.token,
      body: {
        title: '레거시 미승인 공고',
        description: 'x',
        location: '전주',
        job_type: 'full-time',
        deadline: '2026-12-31',
      },
    });
    assert.equal(job.status, 403);
    assert.equal(job.data.code, 'COMPANY_NOT_APPROVED');
  });
});
