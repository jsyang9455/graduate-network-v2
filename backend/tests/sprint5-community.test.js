'use strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'wave1-test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '1d';
process.env.DISABLE_CRON = '1';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = require('path').join(__dirname, '../../tmp-test-uploads-s5');

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

async function login(email) {
  const { status, data } = await jsonRequest('POST', '/api/auth/login', {
    body: { email, password: PASSWORD },
  });
  assert.equal(status, 200, `login failed for ${email}: ${JSON.stringify(data)}`);
  return data.token;
}

describe('Sprint 5 community scrap/report/blind + company profile API', { timeout: 120000 }, () => {
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
      email: 'qa.s5.student.a@jjob.test', name: 'S5학생A', user_type: 'student', school_id: schoolA.id,
    });
    accounts.studentA2 = await upsertUser({
      email: 'qa.s5.student.a2@jjob.test', name: 'S5학생A2', user_type: 'student', school_id: schoolA.id,
    });
    accounts.studentB = await upsertUser({
      email: 'qa.s5.student.b@jjob.test', name: 'S5학생B', user_type: 'student', school_id: schoolB.id,
    });
    accounts.teacherA = await upsertUser({
      email: 'qa.s5.teacher.a@jjob.test', name: 'S5교사A', user_type: 'teacher', school_id: schoolA.id,
    });
    accounts.company = await upsertUser({
      email: 'qa.s5.company@jjob.test', name: 'S5기업', user_type: 'company', school_id: null,
    });

    await query(`DELETE FROM post_reports WHERE reporter_id = ANY($1::int[])`, [[
      accounts.studentA.id, accounts.studentA2.id, accounts.studentB.id,
    ]]);
    await query(`DELETE FROM post_scraps WHERE user_id = ANY($1::int[])`, [[
      accounts.studentA.id, accounts.studentA2.id, accounts.studentB.id,
    ]]);
    await query(`DELETE FROM posts WHERE user_id = ANY($1::int[])`, [[
      accounts.studentA.id, accounts.studentA2.id, accounts.studentB.id, accounts.teacherA.id,
    ]]);
    await query(`DELETE FROM company_profiles WHERE user_id = $1`, [accounts.company.id]);

    const post = await query(
      `INSERT INTO posts (user_id, category, title, content, school_id, is_anonymous, likes_count)
       VALUES ($1, 'employment_review', 'S5 취업후기', '좋은 회사', $2, true, 5)
       RETURNING id`,
      [accounts.studentA.id, schoolA.id]
    );
    accounts.postAId = post.rows[0].id;

    const postB = await query(
      `INSERT INTO posts (user_id, category, title, content, school_id)
       VALUES ($1, 'job_qa', 'S5 B교 Q&A', '내용', $2) RETURNING id`,
      [accounts.studentB.id, schoolB.id]
    );
    accounts.postBId = postB.rows[0].id;

    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  test('REQ-COM-001 categories list includes employment_review', async () => {
    const { status, data } = await jsonRequest('GET', '/api/posts/categories');
    assert.equal(status, 200);
    const codes = (data.categories || []).map((c) => c.code);
    assert.ok(codes.includes('employment_review'));
    assert.ok(codes.includes('interview_review'));
    assert.ok(codes.includes('job_qa'));
    assert.ok(codes.includes('mentoring'));
  });

  test('REQ-COM-003 scrap same-school post; cross-school scrap 403', async () => {
    const tokenA = await login('qa.s5.student.a2@jjob.test');
    const scrap = await jsonRequest('POST', `/api/posts/${accounts.postAId}/scrap`, { token: tokenA });
    assert.equal(scrap.status, 201, JSON.stringify(scrap.data));

    const mine = await jsonRequest('GET', '/api/posts/scraps/me', { token: tokenA });
    assert.equal(mine.status, 200);
    const ids = (mine.data.posts || []).map((p) => Number(p.id));
    assert.ok(ids.includes(Number(accounts.postAId)));

    const tokenB = await login('qa.s5.student.b@jjob.test');
    const cross = await jsonRequest('POST', `/api/posts/${accounts.postAId}/scrap`, { token: tokenB });
    assert.equal(cross.status, 403);
  });

  test('REQ-COM-003 anonymous author hidden from peers', async () => {
    const token = await login('qa.s5.student.a2@jjob.test');
    const { status, data } = await jsonRequest('GET', `/api/posts/${accounts.postAId}`, { token });
    assert.equal(status, 200);
    assert.equal(data.post.author_name, '익명');
    assert.equal(data.scraped, true);
  });

  test('REQ-COM-004 popular sort returns posts ordered by likes', async () => {
    const token = await login('qa.s5.student.a@jjob.test');
    await query(`UPDATE posts SET likes_count = 999 WHERE id = $1`, [accounts.postAId]);
    await query(
      `INSERT INTO posts (user_id, category, title, content, school_id, likes_count)
       VALUES ($1, 'mentoring', 'S5 저인기', 'x', $2, 0)`,
      [accounts.studentA.id, schoolA.id]
    );
    const { status, data } = await jsonRequest(
      'GET',
      '/api/posts?sort=popular&search=S5&limit=10',
      { token }
    );
    assert.equal(status, 200);
    const posts = data.posts || [];
    assert.ok(posts.length >= 2);
    const likes = posts.map((p) => Number(p.likes_count));
    for (let i = 1; i < likes.length; i++) {
      assert.ok(likes[i - 1] >= likes[i], `likes not desc: ${likes.join(',')}`);
    }
    assert.equal(Number(posts[0].id), Number(accounts.postAId));
  });

  test('REQ-COM-005 report then teacher blind; list hides blinded', async () => {
    const tokenPeer = await login('qa.s5.student.a2@jjob.test');
    const report = await jsonRequest('POST', `/api/posts/${accounts.postAId}/report`, {
      token: tokenPeer,
      body: { reason: '스팸/광고' },
    });
    assert.equal(report.status, 201, JSON.stringify(report.data));

    const tokenTeacher = await login('qa.s5.teacher.a@jjob.test');
    const reports = await jsonRequest('GET', '/api/posts/reports', { token: tokenTeacher });
    assert.equal(reports.status, 200);
    assert.ok((reports.data.reports || []).some((r) => Number(r.post_id) === Number(accounts.postAId)));

    const blind = await jsonRequest('POST', `/api/posts/${accounts.postAId}/blind`, {
      token: tokenTeacher,
      body: { reason: '정책 위반' },
    });
    assert.equal(blind.status, 200, JSON.stringify(blind.data));

    const list = await jsonRequest('GET', '/api/posts?limit=50', { token: tokenPeer });
    assert.equal(list.status, 200);
    const ids = (list.data.posts || []).map((p) => Number(p.id));
    assert.equal(ids.includes(Number(accounts.postAId)), false);

    const detail = await jsonRequest('GET', `/api/posts/${accounts.postAId}`, { token: tokenPeer });
    assert.equal(detail.status, 404);
  });

  test('REQ-PLT-001 company profile upsert via API (no localStorage)', async () => {
    const token = await login('qa.s5.company@jjob.test');
    const put = await jsonRequest('PUT', '/api/users/company-profile', {
      token,
      body: {
        company_name: 'S5테스트기업',
        industry: '제조',
        company_size: '30',
        description: 'API only',
      },
    });
    assert.equal(put.status, 200, JSON.stringify(put.data));
    assert.equal(put.data.profile.company_name, 'S5테스트기업');

    const get = await jsonRequest('GET', '/api/users/company-profile', { token });
    assert.equal(get.status, 200);
    assert.equal(get.data.profile.company_name, 'S5테스트기업');
  });
});
