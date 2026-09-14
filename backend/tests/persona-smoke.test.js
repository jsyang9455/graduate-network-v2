'use strict';

/**
 * Lightweight persona smoke (Playwright 대안).
 * REQ-REC-004 / REQ-TRP-002: login → recommendation feed OR field-trips list.
 * Sprint 7: also covers Sprint 6 paths — associated recs, COM tags/scrap,
 * job scrap, field-trip after-report (API-level when browser UAT blocked).
 *
 * Runs inside `npm --prefix backend test` (node:test). No browser install required.
 * Optional browser: `npm run test:e2e` — see docs/qa/e2e-persona-smoke.md
 * and docs/qa/sprint7-browser-uat.md
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'wave1-test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '1d';
process.env.DISABLE_CRON = '1';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = require('path').join(__dirname, '../../tmp-test-uploads-e2e');
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
const fixtures = {};
const PASSWORD = 'password123';
const EMAIL = 'qa.e2e.persona@jjob.test';
const EMAIL_TEACHER = 'qa.e2e.teacher@jjob.test';
const EMAIL_PEER = 'qa.e2e.peer@jjob.test';
const EMAIL_COMPANY = 'qa.e2e.company@jjob.test';

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

describe('Persona smoke: login → recommendations or field-trips', { timeout: 120000 }, () => {
  before(async () => {
    await ensureUsersTable();
    await applyPendingMigrations();

    const school = await query(`SELECT * FROM schools WHERE name = '전주공업고등학교' LIMIT 1`);
    if (!school.rows.length) throw new Error('Default school missing');
    schoolA = school.rows[0];

    await query(
      `INSERT INTO schools (code, name, region, status)
       VALUES ('QE2E', '군산공업고등학교', '전북', 'active')
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, status = 'active'`
    );
    schoolB = (await query(`SELECT * FROM schools WHERE code = 'QE2E'`)).rows[0];

    fixtures.student = await upsertUser({
      email: EMAIL, name: 'E2E학생', user_type: 'student', school_id: schoolA.id,
    });
    fixtures.peer = await upsertUser({
      email: EMAIL_PEER, name: 'E2E동료', user_type: 'student', school_id: schoolA.id,
    });
    fixtures.teacher = await upsertUser({
      email: EMAIL_TEACHER, name: 'E2E교사', user_type: 'teacher', school_id: schoolA.id,
    });
    fixtures.company = await upsertUser({
      email: EMAIL_COMPANY, name: 'E2E기업', user_type: 'company', school_id: schoolA.id,
    });

    await query(`DELETE FROM job_scraps WHERE user_id = ANY($1::int[])`, [[
      fixtures.student.id, fixtures.peer.id,
    ]]);
    await query(`DELETE FROM post_scraps WHERE user_id = $1`, [fixtures.student.id]);
    await query(`DELETE FROM job_applications WHERE user_id = ANY($1::int[])`, [[
      fixtures.student.id, fixtures.peer.id,
    ]]);
    await query(
      `DELETE FROM jobs WHERE title LIKE 'E2E %' AND company_id = $1`,
      [fixtures.company.id]
    );

    fixtures.jobSeed = (await query(
      `INSERT INTO jobs (company_id, title, description, requirements, location, job_type, status, school_id, deadline)
       VALUES ($1, 'E2E 시드 용접', '용접', '용접', '전주', 'full-time', 'active', $2, CURRENT_DATE + 20)
       RETURNING *`,
      [fixtures.company.id, schoolA.id]
    )).rows[0];
    fixtures.jobAssoc = (await query(
      `INSERT INTO jobs (company_id, title, description, requirements, location, job_type, status, school_id, deadline)
       VALUES ($1, 'E2E 연관 기계', '기계', 'CNC', '전주', 'full-time', 'active', $2, CURRENT_DATE + 25)
       RETURNING *`,
      [fixtures.company.id, schoolA.id]
    )).rows[0];

    await query(
      `INSERT INTO job_applications (job_id, user_id, status)
       VALUES ($1, $2, 'pending'), ($3, $2, 'pending'), ($1, $4, 'pending')
       ON CONFLICT DO NOTHING`,
      [fixtures.jobSeed.id, fixtures.peer.id, fixtures.jobAssoc.id, fixtures.student.id]
    );

    fixtures.trip = (await query(
      `INSERT INTO field_trips (school_id, company_name, title, description, place, event_date, capacity, deadline, mode)
       VALUES ($1, 'E2E기업', 'E2E 견학', '사후보고 스모크', '전주', CURRENT_DATE + 5, 20, CURRENT_DATE + 3, 'fifo')
       RETURNING *`,
      [schoolA.id]
    )).rows[0];

    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  test('login then GET /api/recommendations/me returns 200 with recommendations array', async () => {
    const token = await login(EMAIL);
    const feed = await jsonRequest('GET', '/api/recommendations/me', { token });
    assert.equal(feed.status, 200, JSON.stringify(feed.data));
    assert.ok(Array.isArray(feed.data.recommendations), 'recommendations must be an array');
  });

  test('same token can list field-trips (apply path available)', async () => {
    const token = await login(EMAIL);
    const trips = await jsonRequest('GET', '/api/field-trips', { token });
    assert.equal(trips.status, 200, JSON.stringify(trips.data));
    assert.ok(Array.isArray(trips.data.field_trips), 'field_trips must be an array');
  });

  test('Sprint6 path: associated recommendations (REQ-REC-002)', async () => {
    const token = await login(EMAIL);
    const res = await jsonRequest('GET', '/api/recommendations/associated', { token });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.ok(Array.isArray(res.data.recommendations));
    const ids = res.data.recommendations.map((r) => r.job_id);
    assert.ok(ids.includes(fixtures.jobAssoc.id), 'should recommend co-applied job');
  });

  test('Sprint6 path: job scrap + list (REQ-REC-002)', async () => {
    const token = await login(EMAIL);
    const scrap = await jsonRequest('POST', `/api/jobs/${fixtures.jobSeed.id}/scrap`, { token });
    assert.ok([200, 201].includes(scrap.status), JSON.stringify(scrap.data));
    const mine = await jsonRequest('GET', '/api/jobs/scraps/me', { token });
    assert.equal(mine.status, 200, JSON.stringify(mine.data));
    assert.ok((mine.data.jobs || mine.data.scraps || []).some((j) => j.id === fixtures.jobSeed.id));
  });

  test('Sprint6 path: COM tags + community scrap (REQ-COM-002/003)', async () => {
    const token = await login(EMAIL);
    const created = await jsonRequest('POST', '/api/posts', {
      token,
      body: {
        category: 'job_qa',
        title: 'E2E 태그 글',
        content: 'persona smoke tag',
        tags: ['용접', 'E2E'],
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.ok(Array.isArray(created.data.post.tags));
    assert.ok(created.data.post.tags.includes('용접'));

    const filtered = await jsonRequest('GET', '/api/posts?tag=용접', { token });
    assert.equal(filtered.status, 200);
    assert.ok((filtered.data.posts || []).some((p) => p.id === created.data.post.id));

    const scrap = await jsonRequest('POST', `/api/posts/${created.data.post.id}/scrap`, { token });
    assert.ok([200, 201].includes(scrap.status), JSON.stringify(scrap.data));
    const scraps = await jsonRequest('GET', '/api/posts/scraps/me', { token });
    assert.equal(scraps.status, 200, JSON.stringify(scraps.data));
    assert.ok((scraps.data.posts || scraps.data.scraps || []).some((p) => p.id === created.data.post.id));
  });

  test('Sprint6 path: field-trip after-report (REQ-TRP-003)', async () => {
    const token = await login(EMAIL_TEACHER);
    const put = await jsonRequest('PUT', `/api/field-trips/${fixtures.trip.id}/report`, {
      token,
      body: {
        summary: 'E2E 견학 사후보고',
        outcome: '양호',
        attendees_present: 8,
        attendees_absent: 0,
      },
    });
    assert.equal(put.status, 200, JSON.stringify(put.data));
    const get = await jsonRequest('GET', `/api/field-trips/${fixtures.trip.id}/report`, { token });
    assert.equal(get.status, 200);
    assert.ok(get.data.report);
    assert.ok(String(get.data.report.summary).includes('E2E'));
  });
});
