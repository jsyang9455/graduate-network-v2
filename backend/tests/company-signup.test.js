'use strict';

/**
 * Company signup + job scope (REQ-IAM-006, REQ-JOB-001, REQ-PLT-002)
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'company-signup-test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '1d';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { query, pool } = require('../config/database');
const { applyPendingMigrations } = require('../scripts/apply-migrations');
const app = require('../server');

let server;
let baseUrl;
let schoolA;
let schoolB;
const PASSWORD = 'password123';
const stamp = Date.now();
const EMAIL_A = `qa.company.signup.a.${stamp}@jjob.test`;
const EMAIL_B = `qa.company.signup.b.${stamp}@jjob.test`;
const EMAIL_ADMIN = `qa.company.signup.admin.${stamp}@jjob.test`;

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

describe('Company signup + job scope', { timeout: 120000 }, () => {
  before(async () => {
    await ensureUsersTable();
    await applyPendingMigrations();

    const schools = await query(
      `SELECT id, name FROM schools WHERE status = 'active' ORDER BY id ASC LIMIT 2`
    );
    if (schools.rows.length < 2) {
      const a = await query(
        `INSERT INTO schools (name, status) VALUES ('QA Company School A', 'active') RETURNING id, name`
      );
      const b = await query(
        `INSERT INTO schools (name, status) VALUES ('QA Company School B', 'active') RETURNING id, name`
      );
      schoolA = a.rows[0];
      schoolB = b.rows[0];
    } else {
      schoolA = schools.rows[0];
      schoolB = schools.rows[1];
    }

    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await query(`DELETE FROM job_applications WHERE job_id IN (SELECT id FROM jobs WHERE company_id IN (SELECT id FROM users WHERE email = ANY($1::text[])))`, [[EMAIL_A, EMAIL_B]]);
    await query(`DELETE FROM jobs WHERE company_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))`, [[EMAIL_A, EMAIL_B]]);
    await query(`DELETE FROM company_profiles WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))`, [[EMAIL_A, EMAIL_B]]);
    await query(`DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))`, [[EMAIL_A, EMAIL_B]]);
    await query(`DELETE FROM users WHERE email = ANY($1::text[])`, [[EMAIL_A, EMAIL_B, EMAIL_ADMIN]]);
  });

  test('POST /api/auth/register rejects admin privilege', async () => {
    const { status, data } = await jsonRequest('POST', '/api/auth/register', {
      body: {
        email: EMAIL_ADMIN,
        password: PASSWORD,
        name: '위장관리자',
        user_type: 'admin',
        school_id: schoolA.id,
      },
    });
    assert.ok(status === 400 || status === 403, `expected 400/403 got ${status}: ${JSON.stringify(data)}`);
  });

  test('POST /api/auth/register company requires school_id', async () => {
    const { status, data } = await jsonRequest('POST', '/api/auth/register', {
      body: {
        email: `qa.company.noschool.${stamp}@jjob.test`,
        password: PASSWORD,
        name: '무학교기업',
        user_type: 'company',
        company_name: '무학교기업',
      },
    });
    assert.equal(status, 400, JSON.stringify(data));
    assert.ok(data.code === 'VALIDATION' || /학교/.test(String(data.error || '')));
  });

  test('REQ-IAM-006 company register creates role + profile + school binding', async () => {
    const { status, data } = await jsonRequest('POST', '/api/auth/register', {
      body: {
        email: EMAIL_A,
        password: PASSWORD,
        name: '담당자A',
        user_type: 'company',
        phone: '010-1111-2222',
        school_id: schoolA.id,
        company_name: 'QA협력기업A',
        industry: '제조',
        company_size: 'sme',
        address: '전주시',
      },
    });
    assert.equal(status, 201, JSON.stringify(data));
    assert.equal(data.user.user_type, 'company');
    assert.equal(Number(data.user.school_id), Number(schoolA.id));
    assert.ok(data.token);
    assert.ok(data.company_profile);
    assert.equal(data.company_profile.company_name, 'QA협력기업A');

    const roles = await query(
      `SELECT r.code, ur.school_id
       FROM user_roles ur JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1`,
      [data.user.id]
    );
    assert.ok(roles.rows.some((r) => r.code === 'company'));
    assert.ok(roles.rows.some((r) => Number(r.school_id) === Number(schoolA.id)));
  });

  test('REQ-JOB-001 company can POST job scoped to own school', async () => {
    const login = await jsonRequest('POST', '/api/auth/login', {
      body: { email: EMAIL_A, password: PASSWORD },
    });
    assert.equal(login.status, 200);
    const token = login.data.token;

    const { status, data } = await jsonRequest('POST', '/api/jobs', {
      token,
      body: {
        title: 'QA 기업 공고 A',
        description: '학교 A 대상 채용',
        location: '전주',
        job_type: 'full-time',
        deadline: '2026-12-31',
      },
    });
    assert.equal(status, 201, JSON.stringify(data));
    assert.equal(Number(data.job.school_id), Number(schoolA.id));
    assert.ok(data.job.company_id);
  });

  test('REQ-IAM-009 company A cannot manage school B job', async () => {
    const regB = await jsonRequest('POST', '/api/auth/register', {
      body: {
        email: EMAIL_B,
        password: PASSWORD,
        name: '담당자B',
        user_type: 'company',
        phone: '010-3333-4444',
        school_id: schoolB.id,
        company_name: 'QA협력기업B',
      },
    });
    assert.equal(regB.status, 201, JSON.stringify(regB.data));

    const loginB = await jsonRequest('POST', '/api/auth/login', {
      body: { email: EMAIL_B, password: PASSWORD },
    });
    const jobB = await jsonRequest('POST', '/api/jobs', {
      token: loginB.data.token,
      body: {
        title: 'QA 기업 공고 B',
        description: '학교 B 대상',
        location: '군산',
        job_type: 'full-time',
      },
    });
    assert.equal(jobB.status, 201, JSON.stringify(jobB.data));

    const loginA = await jsonRequest('POST', '/api/auth/login', {
      body: { email: EMAIL_A, password: PASSWORD },
    });
    const put = await jsonRequest('PUT', `/api/jobs/${jobB.data.job.id}`, {
      token: loginA.data.token,
      body: { title: '해킹시도' },
    });
    assert.equal(put.status, 403, JSON.stringify(put.data));

    const getProfile = await jsonRequest('GET', '/api/users/company-profile', {
      token: loginA.data.token,
    });
    assert.equal(getProfile.status, 200);
    assert.equal(getProfile.data.profile.company_name, 'QA협력기업A');
  });
});
