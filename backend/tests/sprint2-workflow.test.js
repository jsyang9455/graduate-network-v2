'use strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'wave1-test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '1d';
delete process.env.ALIMTALK_API_KEY;
delete process.env.ALIMTALK_SENDER_KEY;

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { query } = require('../config/database');
const { applyPendingMigrations } = require('../scripts/apply-migrations');
const app = require('../server');
const { canTransition } = require('../lib/applicationStatus');

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
    const { pool } = require('../config/database');
    const schema = fs.readFileSync(path.join(__dirname, '../../database/schema.sql'), 'utf8');
    await pool.query(schema);
  }
}

async function upsertUser({ email, name, user_type, school_id }) {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length) {
    const result = await query(
      `UPDATE users SET password_hash = $1, name = $2, user_type = $3, school_id = $4, is_active = true, is_counselor = $5
       WHERE email = $6 RETURNING *`,
      [hash, name, user_type, school_id, user_type === 'teacher', email]
    );
    return result.rows[0];
  }
  const result = await query(
    `INSERT INTO users (email, password_hash, name, user_type, school_id, is_active, is_counselor)
     VALUES ($1, $2, $3, $4, $5, true, $6)
     RETURNING *`,
    [email, hash, name, user_type, school_id, user_type === 'teacher']
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

describe('Sprint 2 jobs workflow and tenancy', { timeout: 120000 }, () => {
  before(async () => {
    await ensureUsersTable();
    await applyPendingMigrations();
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_counselor BOOLEAN DEFAULT false`);

    const a = await query(`SELECT * FROM schools WHERE name = '전주공업고등학교' LIMIT 1`);
    if (!a.rows.length) throw new Error('Default school missing');
    schoolA = a.rows[0];
    await query(
      `INSERT INTO schools (code, name, region, status)
       VALUES ('QSCB', '군산기계공업고등학교', '전북', 'active')
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, status = 'active'`
    );
    schoolB = (await query(`SELECT * FROM schools WHERE code = 'QSCB'`)).rows[0];

    accounts.studentA = await upsertUser({
      email: 'qa.s2.student.a@jjob.test', name: 'S2학생A', user_type: 'student', school_id: schoolA.id,
    });
    accounts.studentB = await upsertUser({
      email: 'qa.s2.student.b@jjob.test', name: 'S2학생B', user_type: 'student', school_id: schoolB.id,
    });
    accounts.teacherA = await upsertUser({
      email: 'qa.s2.teacher.a@jjob.test', name: 'S2교사A', user_type: 'teacher', school_id: schoolA.id,
    });
    accounts.teacherB = await upsertUser({
      email: 'qa.s2.teacher.b@jjob.test', name: 'S2교사B', user_type: 'teacher', school_id: schoolB.id,
    });
    accounts.companyA = await upsertUser({
      email: 'qa.s2.company.a@jjob.test', name: 'S2기업A', user_type: 'company', school_id: schoolA.id,
    });
    accounts.companyB = await upsertUser({
      email: 'qa.s2.company.b@jjob.test', name: 'S2기업B', user_type: 'company', school_id: schoolB.id,
    });

    await query(`DELETE FROM job_applications WHERE user_id = ANY($1::int[])`, [[
      accounts.studentA.id, accounts.studentB.id,
    ]]);
    await query(`DELETE FROM notifications WHERE user_id = ANY($1::int[])`, [[
      accounts.studentA.id, accounts.studentB.id, accounts.companyA.id, accounts.teacherA.id,
    ]]);
    await query(`DELETE FROM resumes WHERE user_id = ANY($1::int[])`, [[
      accounts.studentA.id, accounts.studentB.id,
    ]]);
    await query(`DELETE FROM counseling_sessions WHERE user_id = ANY($1::int[]) OR counselor_id = ANY($1::int[])`, [[
      accounts.studentA.id, accounts.studentB.id, accounts.teacherA.id, accounts.teacherB.id,
    ]]);
    await query(`DELETE FROM counseling_journals WHERE teacher_id = ANY($1::int[])`, [[
      accounts.teacherA.id, accounts.teacherB.id,
    ]]);
    await query(`DELETE FROM jobs WHERE company_id = ANY($1::int[])`, [[
      accounts.companyA.id, accounts.companyB.id,
    ]]);

    accounts.jobA = (await query(
      `INSERT INTO jobs (company_id, title, description, location, job_type, status, school_id)
       VALUES ($1, 'S2 학교A 공고', '설명', '전주', 'full-time', 'active', $2)
       RETURNING *`,
      [accounts.companyA.id, schoolA.id]
    )).rows[0];
    accounts.jobB = (await query(
      `INSERT INTO jobs (company_id, title, description, location, job_type, status, school_id)
       VALUES ($1, 'S2 학교B 공고', '설명', '군산', 'full-time', 'active', $2)
       RETURNING *`,
      [accounts.companyB.id, schoolB.id]
    )).rows[0];

    accounts.sessionB = (await query(
      `INSERT INTO counseling_sessions (user_id, counselor_id, session_type, session_date, topic, status, school_id)
       VALUES ($1, $2, 'career', NOW() + interval '1 day', 'B교 상담', 'pending', $3)
       RETURNING *`,
      [accounts.studentB.id, accounts.teacherB.id, schoolB.id]
    )).rows[0];

    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  test('GET /api/users without token is 401 (not a public dump)', async () => {
    const { status } = await jsonRequest('GET', '/api/users?limit=5');
    assert.equal(status, 401);
  });

  test('REQ-IAM-009 teacher A jobs list excludes school B job', async () => {
    const token = await login('qa.s2.teacher.a@jjob.test');
    const { status, data } = await jsonRequest('GET', '/api/jobs?status=all&limit=200', { token });
    assert.equal(status, 200);
    const ids = (data.jobs || []).map((j) => Number(j.id));
    assert.ok(ids.includes(Number(accounts.jobA.id)));
    assert.equal(ids.includes(Number(accounts.jobB.id)), false);
  });

  test('REQ-IAM-009 teacher A GET school B job is 403', async () => {
    const token = await login('qa.s2.teacher.a@jjob.test');
    const { status } = await jsonRequest('GET', `/api/jobs/${accounts.jobB.id}`, { token });
    assert.equal(status, 403);
  });

  test('REQ-IAM-009 teacher A PUT school B job is 403', async () => {
    const token = await login('qa.s2.teacher.a@jjob.test');
    const { status } = await jsonRequest('PUT', `/api/jobs/${accounts.jobB.id}`, {
      token,
      body: { title: '해킹된 공고' },
    });
    assert.equal(status, 403);
  });

  test('REQ-IAM-009 counseling teachers list is school-scoped', async () => {
    const token = await login('qa.s2.student.a@jjob.test');
    const { status, data } = await jsonRequest('GET', '/api/counseling/teachers', { token });
    assert.equal(status, 200);
    const ids = (data.teachers || []).map((t) => Number(t.id));
    assert.ok(ids.includes(Number(accounts.teacherA.id)));
    assert.equal(ids.includes(Number(accounts.teacherB.id)), false);
  });

  test('REQ-IAM-009 GET counseling teachers without token is 401', async () => {
    const { status } = await jsonRequest('GET', '/api/counseling/teachers');
    assert.equal(status, 401);
  });

  test('REQ-IAM-009 teacher A cannot update school B counseling session (403)', async () => {
    const token = await login('qa.s2.teacher.a@jjob.test');
    const { status } = await jsonRequest('PUT', `/api/counseling/${accounts.sessionB.id}`, {
      token,
      body: { status: 'approved', notes: 'cross' },
    });
    assert.equal(status, 403);
  });

  test('REQ-JOB-005 apply with selected resume_id (not only primary)', async () => {
    const token = await login('qa.s2.student.a@jjob.test');
    const primary = await jsonRequest('POST', '/api/resumes', {
      token,
      body: { title: '대표 이력서', summary: '대표' },
    });
    assert.equal(primary.status, 201, JSON.stringify(primary.data));
    const second = await jsonRequest('POST', '/api/resumes', {
      token,
      body: { title: '선택용 이력서', summary: '선택' },
    });
    assert.equal(second.status, 201, JSON.stringify(second.data));
    accounts.resumePickId = second.data.resume.id;

    const applied = await jsonRequest('POST', `/api/jobs/${accounts.jobA.id}/apply`, {
      token,
      body: { resume_id: accounts.resumePickId, cover_letter: '선택 이력서로 지원' },
    });
    assert.equal(applied.status, 201, JSON.stringify(applied.data));
    assert.equal(Number(applied.data.application.resume_id), Number(accounts.resumePickId));
    accounts.applicationAId = applied.data.application.id;
  });

  test('REQ-JOB-003 status workflow pending→reviewed→interviewed→accepted', async () => {
    assert.equal(canTransition('pending', 'reviewed'), true);
    assert.equal(canTransition('pending', 'accepted'), false);
    const token = await login('qa.s2.company.a@jjob.test');

    const bad = await jsonRequest('PATCH', `/api/jobs/applications/${accounts.applicationAId}/status`, {
      token,
      body: { status: 'accepted' },
    });
    assert.equal(bad.status, 400);

    const reviewed = await jsonRequest('PATCH', `/api/jobs/applications/${accounts.applicationAId}/status`, {
      token,
      body: { status: 'reviewed' },
    });
    assert.equal(reviewed.status, 200, JSON.stringify(reviewed.data));
    assert.equal(reviewed.data.application.status, 'reviewed');

    const interviewed = await jsonRequest('PATCH', `/api/jobs/applications/${accounts.applicationAId}/status`, {
      token,
      body: { status: 'interviewed' },
    });
    assert.equal(interviewed.status, 200);
    assert.equal(interviewed.data.application.status, 'interviewed');

    const accepted = await jsonRequest('PATCH', `/api/jobs/applications/${accounts.applicationAId}/status`, {
      token,
      body: { status: 'accepted' },
    });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.data.application.status, 'accepted');
  });

  test('REQ-IAM-009 school B company cannot PATCH school A application (403)', async () => {
    const token = await login('qa.s2.company.b@jjob.test');
    const { status } = await jsonRequest('PATCH', `/api/jobs/applications/${accounts.applicationAId}/status`, {
      token,
      body: { status: 'rejected' },
    });
    assert.equal(status, 403);
  });

  test('REQ-JOB-004 / REQ-MSG-010 status change creates in-app notification; alimtalk NOT_CONFIGURED', async () => {
    const rows = await query(
      `SELECT * FROM notifications WHERE user_id = $1 AND event_code = 'JOB_APPLICATION_STATUS' ORDER BY id DESC`,
      [accounts.studentA.id]
    );
    assert.ok(rows.rows.length >= 1);
    assert.equal(rows.rows[0].channel, 'in_app');

    const token = await login('qa.s2.student.a@jjob.test');
    const listed = await jsonRequest('GET', '/api/notifications', { token });
    assert.equal(listed.status, 200);
    assert.ok((listed.data.notifications || []).some((n) => n.event_code === 'JOB_APPLICATION_STATUS'));

    const providers = await jsonRequest('GET', '/api/notifications/providers', { token });
    assert.equal(providers.status, 200);
    assert.equal(providers.data.alimtalk.code, 'NOT_CONFIGURED');
  });

  test('REQ-CNS-003 follow-up counseling creates in-app alert', async () => {
    const token = await login('qa.s2.teacher.a@jjob.test');
    const created = await jsonRequest('POST', '/api/counseling-journals', {
      token,
      body: {
        student_id: accounts.studentA.id,
        student_name: 'S2학생A',
        counseling_date: '2026-09-14',
        type: '취업상담',
        title: '후속 상담 안내',
        content: '다음 주에 이어서 진행합니다.',
        follow_up: '취업 서류 점검',
        follow_up_at: '2026-09-21',
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));

    const notes = await query(
      `SELECT * FROM notifications WHERE user_id = $1 AND event_code = 'CNS_FOLLOW_UP' ORDER BY id DESC`,
      [accounts.studentA.id]
    );
    assert.ok(notes.rows.length >= 1);
  });
});
