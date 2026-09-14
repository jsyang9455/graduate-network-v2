'use strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'wave1-test-secret';
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
const accounts = {};

const PASSWORD = 'password123';

async function ensureUsersTable() {
  const check = await query(`SELECT to_regclass('public.users') AS t`);
  if (!check.rows[0].t) {
    const fs = require('fs');
    const path = require('path');
    const schema = fs.readFileSync(path.join(__dirname, '../../database/schema.sql'), 'utf8');
    const { pool } = require('../config/database');
    await pool.query(schema);
  }
}

async function upsertUser({ email, name, user_type, school_id }) {
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
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING *`,
    [email, hash, name, user_type, school_id]
  );
  return result.rows[0];
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

async function login(email) {
  const { status, data } = await jsonRequest('POST', '/api/auth/login', {
    body: { email, password: PASSWORD },
  });
  assert.equal(status, 200, `login failed for ${email}: ${JSON.stringify(data)}`);
  return data.token;
}

describe('Wave 1 tenancy', { timeout: 120000 }, () => {
before(async () => {
  await ensureUsersTable();
  await applyPendingMigrations();

  const a = await query(`SELECT * FROM schools WHERE name = '전주공업고등학교' LIMIT 1`);
  if (!a.rows.length) {
    throw new Error('Default school 전주공업고등학교 missing after migration');
  }
  schoolA = a.rows[0];

  await query(
    `INSERT INTO schools (code, name, region, status)
     VALUES ('QSCB', '군산기계공업고등학교', '전북', 'active')
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, status = 'active'`
  );
  const b = await query(`SELECT * FROM schools WHERE code = 'QSCB'`);
  schoolB = b.rows[0];

  accounts.sys = await upsertUser({
    email: 'qa.sys@jjob.test',
    name: 'QA시스템관리자',
    user_type: 'admin',
    school_id: schoolA.id,
  });
  accounts.teacherA = await upsertUser({
    email: 'qa.teacher.a@jjob.test',
    name: 'QA교사A',
    user_type: 'teacher',
    school_id: schoolA.id,
  });
  accounts.teacherB = await upsertUser({
    email: 'qa.teacher.b@jjob.test',
    name: 'QA교사B',
    user_type: 'teacher',
    school_id: schoolB.id,
  });
  accounts.studentA = await upsertUser({
    email: 'qa.student.a@jjob.test',
    name: 'QA학생A',
    user_type: 'student',
    school_id: schoolA.id,
  });
  accounts.studentB = await upsertUser({
    email: 'qa.student.b@jjob.test',
    name: 'QA학생B',
    user_type: 'student',
    school_id: schoolB.id,
  });
  accounts.sadminA = await upsertUser({
    email: 'qa.sadmin.a@jjob.test',
    name: 'QA학교관리자A',
    user_type: 'school_admin',
    school_id: schoolA.id,
  });

  await query(`DELETE FROM counseling_journals WHERE teacher_id = ANY($1::int[])`, [[
    accounts.teacherA.id, accounts.teacherB.id,
  ]]);

  const journalB = await query(
    `INSERT INTO counseling_journals
       (teacher_id, teacher_name, student_id, student_name, counseling_date, type, title, content, school_id)
     VALUES ($1, $2, $3, $4, CURRENT_DATE, '진로상담', 'B교 일지', '타교 내용', $5)
     RETURNING id`,
    [accounts.teacherB.id, 'QA교사B', accounts.studentB.id, 'QA학생B', schoolB.id]
  );
  accounts.journalBId = journalB.rows[0].id;

  server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await pool.end();
});

test('REQ-IAM-001 GET /api/schools lists default school without auth', async () => {
  const { status, data } = await jsonRequest('GET', '/api/schools');
  assert.equal(status, 200);
  const names = (data.schools || []).map((s) => s.name);
  assert.ok(names.includes('전주공업고등학교'));
  assert.ok(names.includes('군산기계공업고등학교'));
});

test('REQ-IAM-008 GET /api/me/permissions returns role menus', async () => {
  const token = await login('qa.teacher.a@jjob.test');
  const { status, data } = await jsonRequest('GET', '/api/me/permissions', { token });
  assert.equal(status, 200);
  assert.equal(data.role, 'teacher');
  assert.ok(Array.isArray(data.menus));
  const counseling = data.menus.find((m) => m.code === 'counseling');
  assert.ok(counseling && counseling.actions.includes('write'));
});

test('JWT includes school_id and role', async () => {
  const token = await login('qa.teacher.a@jjob.test');
  const parts = token.split('.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  assert.equal(payload.role, 'teacher');
  assert.equal(Number(payload.school_id), Number(schoolA.id));
});

test('POST /api/auth/change-password without token is 401', async () => {
  const { status, data } = await jsonRequest('POST', '/api/auth/change-password', {
    body: { currentPassword: 'x', newPassword: 'yyyyyy' },
  });
  assert.equal(status, 401);
  assert.ok(data.code === 'UNAUTHENTICATED' || /auth/i.test(data.error || ''));
});

test('test_token_ is not an auth bypass', async () => {
  const { status } = await jsonRequest('GET', '/api/auth/me', { token: 'test_token_fake' });
  assert.equal(status, 401);
});

test('REQ-IAM-009 teacher A cannot GET student B (403)', async () => {
  const token = await login('qa.teacher.a@jjob.test');
  const { status, data } = await jsonRequest('GET', `/api/users/${accounts.studentB.id}`, { token });
  assert.equal(status, 403, JSON.stringify(data));
});

test('REQ-IAM-009 teacher A user list excludes school B students', async () => {
  const token = await login('qa.teacher.a@jjob.test');
  const { status, data } = await jsonRequest('GET', '/api/users?limit=1000', { token });
  assert.equal(status, 200);
  const ids = (data.users || []).map((u) => Number(u.id));
  assert.ok(ids.includes(Number(accounts.studentA.id)));
  assert.equal(ids.includes(Number(accounts.studentB.id)), false);
});

test('REQ-IAM-009 teacher A cannot read school B counseling journal (403)', async () => {
  const token = await login('qa.teacher.a@jjob.test');
  const { status } = await jsonRequest('GET', `/api/counseling-journals/${accounts.journalBId}`, { token });
  assert.equal(status, 403);
});

test('REQ-IAM-009 system admin can read school B student', async () => {
  const token = await login('qa.sys@jjob.test');
  const { status, data } = await jsonRequest('GET', `/api/users/${accounts.studentB.id}`, { token });
  assert.equal(status, 200);
  assert.equal(Number(data.user.id), Number(accounts.studentB.id));
});

test('REQ-IAM-009 school_admin A cannot PATCH school B', async () => {
  const token = await login('qa.sadmin.a@jjob.test');
  const { status } = await jsonRequest('PATCH', `/api/schools/${schoolB.id}`, {
    token,
    body: { name: '해킹된학교' },
  });
  assert.equal(status, 403);
});
});
