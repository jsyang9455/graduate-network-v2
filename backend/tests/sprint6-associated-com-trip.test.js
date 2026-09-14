'use strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'wave1-test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '1d';
process.env.DISABLE_CRON = '1';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = require('path').join(__dirname, '../../tmp-test-uploads-s6');
delete process.env.WORKNET_API_KEY;

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

describe('Sprint 6 associated recs, tags, scrap jobs, trip report, worknet stub', { timeout: 120000 }, () => {
  before(async () => {
    await ensureUsersTable();
    await applyPendingMigrations();

    const a = await query(`SELECT * FROM schools WHERE name = '전주공업고등학교' LIMIT 1`);
    if (!a.rows.length) throw new Error('Default school missing');
    schoolA = a.rows[0];
    await query(
      `INSERT INTO schools (code, name, region, status)
       VALUES ('QSC6', '익산공업고등학교', '전북', 'active')
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, status = 'active'`
    );
    schoolB = (await query(`SELECT * FROM schools WHERE code = 'QSC6'`)).rows[0];

    accounts.studentA = await upsertUser({
      email: 'qa.s6.student.a@jjob.test', name: 'S6학생A', user_type: 'student', school_id: schoolA.id,
    });
    accounts.peerA = await upsertUser({
      email: 'qa.s6.peer.a@jjob.test', name: 'S6동료A', user_type: 'student', school_id: schoolA.id,
    });
    accounts.studentB = await upsertUser({
      email: 'qa.s6.student.b@jjob.test', name: 'S6학생B', user_type: 'student', school_id: schoolB.id,
    });
    accounts.teacherA = await upsertUser({
      email: 'qa.s6.teacher.a@jjob.test', name: 'S6교사A', user_type: 'teacher', school_id: schoolA.id,
    });
    accounts.companyA = await upsertUser({
      email: 'qa.s6.company.a@jjob.test', name: 'S6기업A', user_type: 'company', school_id: schoolA.id,
    });

    await query(`DELETE FROM job_scraps WHERE user_id = ANY($1::int[])`, [[
      accounts.studentA.id, accounts.peerA.id, accounts.studentB.id,
    ]]);
    await query(`DELETE FROM job_applications WHERE user_id = ANY($1::int[])`, [[
      accounts.studentA.id, accounts.peerA.id, accounts.studentB.id,
    ]]);
    await query(
      `DELETE FROM jobs WHERE title LIKE 'S6 %' AND company_id = $1`,
      [accounts.companyA.id]
    );

    accounts.jobSeed = (await query(
      `INSERT INTO jobs (company_id, title, description, requirements, location, job_type, status, school_id, deadline)
       VALUES ($1, 'S6 시드 용접', '용접 CNC', '용접', '전주', 'full-time', 'active', $2, CURRENT_DATE + 20)
       RETURNING *`,
      [accounts.companyA.id, schoolA.id]
    )).rows[0];
    accounts.jobAssoc = (await query(
      `INSERT INTO jobs (company_id, title, description, requirements, location, job_type, status, school_id, deadline)
       VALUES ($1, 'S6 연관 기계', '기계 설비', 'CNC', '전주', 'full-time', 'active', $2, CURRENT_DATE + 25)
       RETURNING *`,
      [accounts.companyA.id, schoolA.id]
    )).rows[0];
    accounts.jobB = (await query(
      `INSERT INTO jobs (company_id, title, description, requirements, location, job_type, status, school_id, deadline)
       VALUES ($1, 'S6 B교 공고', '타교', 'x', '익산', 'full-time', 'active', $2, CURRENT_DATE + 30)
       RETURNING *`,
      [accounts.companyA.id, schoolB.id]
    )).rows[0];

    await query(
      `INSERT INTO job_applications (job_id, user_id, status)
       VALUES ($1, $2, 'pending'), ($3, $2, 'pending'), ($1, $4, 'pending')
       ON CONFLICT DO NOTHING`,
      [accounts.jobSeed.id, accounts.peerA.id, accounts.jobAssoc.id, accounts.studentA.id]
    );

    accounts.tripA = (await query(
      `INSERT INTO field_trips (school_id, company_name, title, description, place, event_date, capacity, deadline, mode)
       VALUES ($1, 'S6기업', 'S6 견학 A', '사후보고 테스트', '전주', CURRENT_DATE + 5, 20, CURRENT_DATE + 3, 'fifo')
       RETURNING *`,
      [schoolA.id]
    )).rows[0];
    accounts.tripB = (await query(
      `INSERT INTO field_trips (school_id, company_name, title, description, place, event_date, capacity, deadline, mode)
       VALUES ($1, 'S6B', 'S6 견학 B', '타교', '익산', CURRENT_DATE + 8, 10, CURRENT_DATE + 4, 'fifo')
       RETURNING *`,
      [schoolB.id]
    )).rows[0];

    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  test('REQ-REC-002 associated recommendations from co-applications (school scoped)', async () => {
    const token = await login('qa.s6.student.a@jjob.test');
    const res = await jsonRequest('GET', '/api/recommendations/associated', { token });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.ok(Array.isArray(res.data.recommendations));
    const ids = res.data.recommendations.map((r) => r.job_id);
    assert.ok(ids.includes(accounts.jobAssoc.id), 'should recommend co-applied job');
    assert.ok(!ids.includes(accounts.jobB.id), 'must not leak school B job');
    const hit = res.data.recommendations.find((r) => r.job_id === accounts.jobAssoc.id);
    assert.ok(hit.reasons.some((x) => x.code === 'also_applied'));
  });

  test('REQ-REC-002 job scrap + also_scraped signal', async () => {
    const peer = await login('qa.s6.peer.a@jjob.test');
    const scrapAssoc = await jsonRequest('POST', `/api/jobs/${accounts.jobAssoc.id}/scrap`, { token: peer });
    assert.equal(scrapAssoc.status, 201, JSON.stringify(scrapAssoc.data));

    const student = await login('qa.s6.student.a@jjob.test');
    const scrapSeed = await jsonRequest('POST', `/api/jobs/${accounts.jobSeed.id}/scrap`, { token: student });
    assert.equal(scrapSeed.status, 201);

    const mine = await jsonRequest('GET', '/api/jobs/scraps/me', { token: student });
    assert.equal(mine.status, 200);
    assert.ok((mine.data.jobs || []).some((j) => j.id === accounts.jobSeed.id));

    const cross = await jsonRequest('POST', `/api/jobs/${accounts.jobSeed.id}/scrap`, {
      token: await login('qa.s6.student.b@jjob.test'),
    });
    assert.equal(cross.status, 403);
  });

  test('REQ-COM-002 post tags create + filter', async () => {
    const token = await login('qa.s6.student.a@jjob.test');
    const created = await jsonRequest('POST', '/api/posts', {
      token,
      body: {
        category: 'job_qa',
        title: 'S6 태그 글',
        content: '직무 태그 테스트',
        tags: ['용접', '현대중공업'],
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.deepEqual(created.data.post.tags, ['용접', '현대중공업']);

    const filtered = await jsonRequest('GET', '/api/posts?tag=용접', { token });
    assert.equal(filtered.status, 200);
    assert.ok((filtered.data.posts || []).some((p) => p.id === created.data.post.id));
  });

  test('REQ-TRP-003 after-report put/get; cross-school 403', async () => {
    const teacher = await login('qa.s6.teacher.a@jjob.test');
    const put = await jsonRequest('PUT', `/api/field-trips/${accounts.tripA.id}/report`, {
      token: teacher,
      body: {
        summary: '견학 완료, 안전교육 실시',
        outcome: '만족',
        attendees_present: 12,
        attendees_absent: 1,
      },
    });
    assert.equal(put.status, 200, JSON.stringify(put.data));
    assert.equal(put.data.report.summary.includes('견학 완료'), true);

    const get = await jsonRequest('GET', `/api/field-trips/${accounts.tripA.id}/report`, { token: teacher });
    assert.equal(get.status, 200);
    assert.ok(get.data.report);

    const cross = await jsonRequest('PUT', `/api/field-trips/${accounts.tripB.id}/report`, {
      token: teacher,
      body: { summary: 'should fail' },
    });
    assert.equal(cross.status, 403);
  });

  test('REQ-WN-010 worknet status NOT_CONFIGURED stub', async () => {
    const token = await login('qa.s6.student.a@jjob.test');
    const status = await jsonRequest('GET', '/api/worknet/status', { token });
    assert.equal(status.status, 200);
    assert.equal(status.data.code, 'NOT_CONFIGURED');
    assert.equal(status.data.configured, false);

    const teacher = await login('qa.s6.teacher.a@jjob.test');
    const sync = await jsonRequest('POST', '/api/worknet/sync', { token: teacher });
    assert.equal(sync.status, 503);
    assert.equal(sync.data.code, 'NOT_CONFIGURED');
  });
});
