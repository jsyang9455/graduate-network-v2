'use strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'wave1-test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '1d';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = require('path').join(__dirname, '../../tmp-test-uploads-s3');

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

async function binaryRequest(path, { token } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, { headers });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf };
}

async function login(email) {
  const { status, data } = await jsonRequest('POST', '/api/auth/login', {
    body: { email, password: PASSWORD },
  });
  assert.equal(status, 200, `login failed for ${email}: ${JSON.stringify(data)}`);
  return data.token;
}

describe('Sprint 3 community tenancy and file privacy', { timeout: 120000 }, () => {
  before(async () => {
    await ensureUsersTable();
    await applyPendingMigrations();

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
      email: 'qa.s3.student.a@jjob.test', name: 'S3학생A', user_type: 'student', school_id: schoolA.id,
    });
    accounts.studentB = await upsertUser({
      email: 'qa.s3.student.b@jjob.test', name: 'S3학생B', user_type: 'student', school_id: schoolB.id,
    });
    accounts.teacherA = await upsertUser({
      email: 'qa.s3.teacher.a@jjob.test', name: 'S3교사A', user_type: 'teacher', school_id: schoolA.id,
    });

    await query(`DELETE FROM posts WHERE user_id = ANY($1::int[])`, [[
      accounts.studentA.id, accounts.studentB.id, accounts.teacherA.id,
    ]]);
    await query(`DELETE FROM announcements WHERE title LIKE 'S3 테스트%'`);
    await query(`DELETE FROM resumes WHERE user_id = ANY($1::int[])`, [[accounts.studentA.id, accounts.studentB.id]]);
    await query(`DELETE FROM certificates WHERE user_id = ANY($1::int[])`, [[accounts.studentA.id, accounts.studentB.id]]);

    const postA = await query(
      `INSERT INTO posts (user_id, category, title, content, school_id)
       VALUES ($1, 'news', 'S3 A교 소식', '내용', $2) RETURNING id`,
      [accounts.teacherA.id, schoolA.id]
    );
    accounts.postAId = postA.rows[0].id;

    const postB = await query(
      `INSERT INTO posts (user_id, category, title, content, school_id)
       VALUES ($1, 'news', 'S3 B교 소식', '내용', $2) RETURNING id`,
      [accounts.studentB.id, schoolB.id]
    );
    accounts.postBId = postB.rows[0].id;

    const annA = await query(
      `INSERT INTO announcements (type, title, is_active, school_id)
       VALUES ('job-fair', 'S3 테스트 A 박람회', true, $1) RETURNING id`,
      [schoolA.id]
    );
    accounts.annAId = annA.rows[0].id;

    const annB = await query(
      `INSERT INTO announcements (type, title, is_active, school_id)
       VALUES ('job-fair', 'S3 테스트 B 박람회', true, $1) RETURNING id`,
      [schoolB.id]
    );
    accounts.annBId = annB.rows[0].id;

    const certA = await query(
      `INSERT INTO certificates (user_id, certificate_type, purpose, status, school_id)
       VALUES ($1, '졸업증명서', '테스트', 'pending', $2) RETURNING id`,
      [accounts.studentA.id, schoolA.id]
    );
    accounts.certAId = certA.rows[0].id;

    const resume = await query(
      `INSERT INTO resumes (user_id, title, school_id, is_primary)
       VALUES ($1, 'S3 이력서', $2, true) RETURNING id`,
      [accounts.studentA.id, schoolA.id]
    );
    accounts.resumeAId = resume.rows[0].id;

    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  test('REQ-IAM-009 student B cannot GET school A post (403)', async () => {
    const token = await login('qa.s3.student.b@jjob.test');
    const { status } = await jsonRequest('GET', `/api/posts/${accounts.postAId}`, { token });
    assert.equal(status, 403);
  });

  test('REQ-IAM-009 student A post list excludes school B', async () => {
    const token = await login('qa.s3.student.a@jjob.test');
    const { status, data } = await jsonRequest('GET', '/api/posts?limit=100', { token });
    assert.equal(status, 200);
    const ids = (data.posts || []).map((p) => Number(p.id));
    assert.ok(ids.includes(Number(accounts.postAId)));
    assert.equal(ids.includes(Number(accounts.postBId)), false);
  });

  test('REQ-IAM-009 student B cannot GET school A announcement detail (403)', async () => {
    const token = await login('qa.s3.student.b@jjob.test');
    const { status } = await jsonRequest('GET', `/api/announcements/detail/${accounts.annAId}`, { token });
    assert.equal(status, 403);
  });

  test('REQ-IAM-009 job-fair list for student A excludes school B announcements', async () => {
    const token = await login('qa.s3.student.a@jjob.test');
    const { status, data } = await jsonRequest('GET', '/api/announcements/job-fair', { token });
    assert.equal(status, 200);
    const ids = (data.announcements || []).map((a) => Number(a.id));
    assert.ok(ids.includes(Number(accounts.annAId)));
    assert.equal(ids.includes(Number(accounts.annBId)), false);
  });

  test('REQ-IAM-009 student B cannot read student A certificate (403)', async () => {
    const token = await login('qa.s3.student.b@jjob.test');
    const { status } = await jsonRequest('GET', `/api/certificates/${accounts.certAId}`, { token });
    assert.equal(status, 403);
  });

  test('REQ-RSM-005 same-school student cannot read peer resume PDF file (403)', async () => {
    const tokenA = await login('qa.s3.student.a@jjob.test');
    const pdf = await jsonRequest('POST', `/api/resumes/${accounts.resumeAId}/pdf`, { token: tokenA, body: {} });
    assert.equal(pdf.status, 201, JSON.stringify(pdf.data));
    accounts.fileId = pdf.data.file.id;

    const peer = await upsertUser({
      email: 'qa.s3.student.a2@jjob.test',
      name: 'S3학생A2',
      user_type: 'student',
      school_id: schoolA.id,
    });
    const tokenPeer = await login('qa.s3.student.a2@jjob.test');
    const { status } = await binaryRequest(`/api/files/${accounts.fileId}`, { token: tokenPeer });
    assert.equal(status, 403);
  });
});
