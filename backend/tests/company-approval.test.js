'use strict';

/**
 * Company approval flag (REQ-JOB-007, REQ-IAM-009, REQ-PLT-002)
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'company-approval-test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '1d';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { query, pool } = require('../config/database');
const { applyPendingMigrations } = require('../scripts/apply-migrations');
const app = require('../server');

let server;
let baseUrl;
let schoolA;
let schoolB;
const PASSWORD = 'password123';
const stamp = Date.now();
const EMAIL_CO = `qa.company.appr.co.${stamp}@jjob.test`;
const EMAIL_SA = `qa.company.appr.sa.${stamp}@jjob.test`;
const EMAIL_SB = `qa.company.appr.sb.${stamp}@jjob.test`;

async function ensureUsersTable() {
  const check = await query(`SELECT to_regclass('public.users') AS t`);
  if (!check.rows[0].t) {
    const fs = require('fs');
    const path = require('path');
    const schema = fs.readFileSync(path.join(__dirname, '../../database/schema.sql'), 'utf8');
    await pool.query(schema);
  }
}

async function jsonRequest(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
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

async function upsertStaff({ email, name, user_type, school_id }) {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length) {
    const result = await query(
      `UPDATE users SET password_hash = $1, name = $2, user_type = $3, school_id = $4, is_active = true
       WHERE email = $5 RETURNING *`,
      [hash, name, user_type, school_id, email]
    );
    return result.rows[0];
  }
  const result = await query(
    `INSERT INTO users (email, password_hash, name, user_type, school_id, is_active)
     VALUES ($1, $2, $3, $4, $5, true) RETURNING *`,
    [email, hash, name, user_type, school_id]
  );
  return result.rows[0];
}

describe('Company approval (REQ-JOB-007)', { timeout: 120000 }, () => {
  let companyUserId;
  let companyToken;

  before(async () => {
    await ensureUsersTable();
    await applyPendingMigrations();

    const schools = await query(
      `SELECT id, name FROM schools WHERE status = 'active' ORDER BY id ASC LIMIT 2`
    );
    if (schools.rows.length < 2) {
      const a = await query(
        `INSERT INTO schools (name, status) VALUES ('QA Appr School A', 'active') RETURNING id, name`
      );
      const b = await query(
        `INSERT INTO schools (name, status) VALUES ('QA Appr School B', 'active') RETURNING id, name`
      );
      schoolA = a.rows[0];
      schoolB = b.rows[0];
    } else {
      schoolA = schools.rows[0];
      schoolB = schools.rows[1];
    }

    await upsertStaff({
      email: EMAIL_SA, name: '승인관리자A', user_type: 'school_admin', school_id: schoolA.id,
    });
    await upsertStaff({
      email: EMAIL_SB, name: '승인관리자B', user_type: 'school_admin', school_id: schoolB.id,
    });

    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await query(`DELETE FROM jobs WHERE company_id IN (SELECT id FROM users WHERE email = $1)`, [EMAIL_CO]);
    await query(`DELETE FROM company_profiles WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [EMAIL_CO]);
    await query(`DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))`, [[EMAIL_CO, EMAIL_SA, EMAIL_SB]]);
    await query(`DELETE FROM users WHERE email = ANY($1::text[])`, [[EMAIL_CO, EMAIL_SA, EMAIL_SB]]);
  });

  test('REQ-JOB-007 register creates pending company profile', async () => {
    const { status, data } = await jsonRequest('POST', '/api/auth/register', {
      body: {
        email: EMAIL_CO,
        password: PASSWORD,
        name: '승인테스트담당',
        user_type: 'company',
        school_id: schoolA.id,
        company_name: '승인대기기업',
        industry: 'IT',
      },
    });
    assert.equal(status, 201, JSON.stringify(data));
    assert.equal(data.company_profile.approval_status, 'pending');
    companyUserId = data.user.id;
    companyToken = data.token;

    const get = await jsonRequest('GET', '/api/users/company-profile', { token: companyToken });
    assert.equal(get.status, 200);
    assert.equal(get.data.profile.approval_status, 'pending');
  });

  test('REQ-JOB-007 pending company cannot POST job', async () => {
    const { status, data } = await jsonRequest('POST', '/api/jobs', {
      token: companyToken,
      body: {
        title: '미승인 공고 시도',
        description: '막혀야 함',
        location: '전주',
        job_type: 'full-time',
      },
    });
    assert.equal(status, 403, JSON.stringify(data));
    assert.equal(data.code, 'COMPANY_NOT_APPROVED');
  });

  test('REQ-IAM-009 school B admin cannot approve school A company', async () => {
    const loginB = await jsonRequest('POST', '/api/auth/login', {
      body: { email: EMAIL_SB, password: PASSWORD },
    });
    assert.equal(loginB.status, 200);

    const { status, data } = await jsonRequest('PATCH', `/api/users/${companyUserId}/company-approval`, {
      token: loginB.data.token,
      body: { status: 'approved' },
    });
    assert.equal(status, 403, JSON.stringify(data));
  });

  test('REQ-JOB-007 school A admin can approve then company can POST job', async () => {
    const loginA = await jsonRequest('POST', '/api/auth/login', {
      body: { email: EMAIL_SA, password: PASSWORD },
    });
    assert.equal(loginA.status, 200);

    const list = await jsonRequest('GET', '/api/users/companies?approval_status=pending', {
      token: loginA.data.token,
    });
    assert.equal(list.status, 200, JSON.stringify(list.data));
    assert.ok((list.data.companies || []).some((c) => Number(c.user_id) === Number(companyUserId)));

    const appr = await jsonRequest('PATCH', `/api/users/${companyUserId}/company-approval`, {
      token: loginA.data.token,
      body: { status: 'approved' },
    });
    assert.equal(appr.status, 200, JSON.stringify(appr.data));
    assert.equal(appr.data.profile.approval_status, 'approved');

    const job = await jsonRequest('POST', '/api/jobs', {
      token: companyToken,
      body: {
        title: '승인 후 공고',
        description: '가능해야 함',
        location: '전주',
        job_type: 'full-time',
        deadline: '2026-12-31',
      },
    });
    assert.equal(job.status, 201, JSON.stringify(job.data));
    assert.equal(Number(job.data.job.school_id), Number(schoolA.id));
  });

  test('REQ-JOB-007 reject then cannot post again', async () => {
    const loginA = await jsonRequest('POST', '/api/auth/login', {
      body: { email: EMAIL_SA, password: PASSWORD },
    });
    const rej = await jsonRequest('PATCH', `/api/users/${companyUserId}/company-approval`, {
      token: loginA.data.token,
      body: { status: 'rejected', rejection_reason: '사업자 정보 불충분' },
    });
    assert.equal(rej.status, 200, JSON.stringify(rej.data));
    assert.equal(rej.data.profile.approval_status, 'rejected');

    const job = await jsonRequest('POST', '/api/jobs', {
      token: companyToken,
      body: {
        title: '반려 후 공고',
        description: '막혀야 함',
        job_type: 'full-time',
      },
    });
    assert.equal(job.status, 403);
    assert.equal(job.data.code, 'COMPANY_NOT_APPROVED');
  });
});
