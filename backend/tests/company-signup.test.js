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
const BIZ_A = '220-81-62517';
const BIZ_B = '1234567891';

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

  test('company register without biz_no → 400', async () => {
    const { status, data } = await jsonRequest('POST', '/api/auth/register', {
      body: {
        email: `qa.company.nobiz.${stamp}@jjob.test`,
        name: '무번호기업',
        user_type: 'company',
        company_name: '무번호기업',
      },
    });
    assert.equal(status, 400, JSON.stringify(data));
    assert.match(String(data.error || data.message || ''), /사업자등록번호/);
  });

  test('company register with invalid biz_no checksum → 400', async () => {
    const { status } = await jsonRequest('POST', '/api/auth/register', {
      body: {
        email: `qa.company.badbiz.${stamp}@jjob.test`,
        name: '오류번호기업',
        user_type: 'company',
        company_name: '오류번호기업',
        biz_no: '123-45-67890',
      },
    });
    assert.equal(status, 400);
  });

  test('REQ-IAM-006 company register: no school, biz_no is password', async () => {
    const { status, data } = await jsonRequest('POST', '/api/auth/register', {
      body: {
        email: EMAIL_A,
        password: 'ignored-password',
        name: '담당자A',
        user_type: 'company',
        phone: '010-1111-2222',
        school_id: schoolA.id,
        company_name: 'QA협력기업A',
        industry: '제조',
        company_size: '11-50',
        address: '전주시',
        biz_no: BIZ_A,
      },
    });
    assert.equal(status, 201, JSON.stringify(data));
    assert.equal(data.user.user_type, 'company');
    assert.equal(data.user.school_id, null);
    assert.ok(data.token);
    assert.equal(data.company_profile.company_name, 'QA협력기업A');
    assert.equal(data.company_profile.biz_no, BIZ_A.replace(/\D/g, ''));
    assert.equal(data.company_profile.approval_status, 'pending');

    const roles = await query(
      `SELECT r.code, ur.school_id
       FROM user_roles ur JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1`,
      [data.user.id]
    );
    assert.ok(roles.rows.some((r) => r.code === 'company' && r.school_id == null));

    const byDigits = await jsonRequest('POST', '/api/auth/login', {
      body: { email: EMAIL_A, password: BIZ_A.replace(/\D/g, '') },
    });
    assert.equal(byDigits.status, 200, 'login with biz_no digits');
    const byHyphen = await jsonRequest('POST', '/api/auth/login', {
      body: { email: EMAIL_A, password: BIZ_A },
    });
    assert.equal(byHyphen.status, 200, 'login with hyphenated biz_no');
    const byIgnored = await jsonRequest('POST', '/api/auth/login', {
      body: { email: EMAIL_A, password: 'ignored-password' },
    });
    assert.equal(byIgnored.status, 401, 'client-sent password must not be used');
    const wrong = await jsonRequest('POST', '/api/auth/login', {
      body: { email: EMAIL_A, password: '1234567891' },
    });
    assert.equal(wrong.status, 401);
  });

  test('REQ-JOB-007 pending company cannot POST job until approved', async () => {
    const login = await jsonRequest('POST', '/api/auth/login', {
      body: { email: EMAIL_A, password: BIZ_A },
    });
    assert.equal(login.status, 200);
    const token = login.data.token;

    const blocked = await jsonRequest('POST', '/api/jobs', {
      token,
      body: {
        title: 'QA 기업 공고 A (미승인)',
        description: '학교 A 대상 채용',
        location: '전주',
        job_type: 'full-time',
        deadline: '2026-12-31',
      },
    });
    assert.equal(blocked.status, 403, JSON.stringify(blocked.data));
    assert.equal(blocked.data.code, 'COMPANY_NOT_APPROVED');

    await query(
      `UPDATE company_profiles SET approval_status = 'approved', approved_at = CURRENT_TIMESTAMP
       WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
      [EMAIL_A]
    );

    const noTarget = await jsonRequest('POST', '/api/jobs', {
      token,
      body: { title: 'QA 대상 없음', description: 'x', job_type: 'full-time' },
    });
    assert.equal(noTarget.status, 400, JSON.stringify(noTarget.data));

    const badTarget = await jsonRequest('POST', '/api/jobs', {
      token,
      body: { title: 'QA 없는 학교', description: 'x', job_type: 'full-time', school_id: 99999999 },
    });
    assert.equal(badTarget.status, 400, JSON.stringify(badTarget.data));

    const { status, data } = await jsonRequest('POST', '/api/jobs', {
      token,
      body: {
        title: 'QA 기업 공고 A',
        description: '학교 A 대상 채용',
        location: '전주',
        job_type: 'full-time',
        deadline: '2026-12-31',
        school_id: schoolA.id,
      },
    });
    assert.equal(status, 201, JSON.stringify(data));
    assert.equal(Number(data.job.school_id), Number(schoolA.id));
    assert.ok(data.job.company_id);

    const mine = await jsonRequest('GET', '/api/jobs?status=all', { token });
    assert.equal(mine.status, 200);
    assert.ok(mine.data.jobs.some((j) => Number(j.id) === Number(data.job.id)), 'company sees own job');
  });

  test('REQ-IAM-009 company A cannot manage school B job', async () => {
    const regB = await jsonRequest('POST', '/api/auth/register', {
      body: {
        email: EMAIL_B,
        name: '담당자B',
        user_type: 'company',
        phone: '010-3333-4444',
        company_name: 'QA협력기업B',
        biz_no: BIZ_B,
      },
    });
    assert.equal(regB.status, 201, JSON.stringify(regB.data));
    assert.equal(regB.data.company_profile.approval_status, 'pending');

    await query(
      `UPDATE company_profiles SET approval_status = 'approved', approved_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [regB.data.user.id]
    );

    const loginB = await jsonRequest('POST', '/api/auth/login', {
      body: { email: EMAIL_B, password: BIZ_B },
    });
    const jobB = await jsonRequest('POST', '/api/jobs', {
      token: loginB.data.token,
      body: {
        title: 'QA 기업 공고 B',
        description: '학교 B 대상',
        location: '군산',
        job_type: 'full-time',
        school_id: schoolB.id,
      },
    });
    assert.equal(jobB.status, 201, JSON.stringify(jobB.data));

    const loginA = await jsonRequest('POST', '/api/auth/login', {
      body: { email: EMAIL_A, password: BIZ_A },
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
