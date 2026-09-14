'use strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'wave1-test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '1d';
process.env.DISABLE_CRON = '1';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = require('path').join(__dirname, '../../tmp-test-uploads-s4');

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { query, pool } = require('../config/database');
const { applyPendingMigrations } = require('../scripts/apply-migrations');
const app = require('../server');
const { scoreJob, extractResumeProfile } = require('../modules/recommendations');

let server;
let baseUrl;
let schoolA;
let schoolB;
const accounts = {};
const PASSWORD = 'password123';
let tripA;
let tripB;
let jobA;
let jobB;

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

describe('Sprint 4 recommendations, field trips, networking tenancy', { timeout: 120000 }, () => {
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
      email: 'qa.s4.student.a@jjob.test', name: 'S4학생A', user_type: 'student', school_id: schoolA.id,
    });
    accounts.studentB = await upsertUser({
      email: 'qa.s4.student.b@jjob.test', name: 'S4학생B', user_type: 'student', school_id: schoolB.id,
    });
    accounts.teacherA = await upsertUser({
      email: 'qa.s4.teacher.a@jjob.test', name: 'S4교사A', user_type: 'teacher', school_id: schoolA.id,
    });
    accounts.gradA = await upsertUser({
      email: 'qa.s4.grad.a@jjob.test', name: 'S4졸업A', user_type: 'graduate', school_id: schoolA.id,
    });
    accounts.gradB = await upsertUser({
      email: 'qa.s4.grad.b@jjob.test', name: 'S4졸업B', user_type: 'graduate', school_id: schoolB.id,
    });

    for (const [userId, major, company, skills] of [
      [accounts.gradA.id, '기계과', '현대', ['용접']],
      [accounts.gradB.id, '전기과', 'LG', ['PLC']],
    ]) {
      await query(`DELETE FROM graduate_profiles WHERE user_id = $1`, [userId]);
      await query(
        `INSERT INTO graduate_profiles (user_id, graduation_year, major, current_company, current_position, bio, skills, is_mentor, mentor_capacity)
         VALUES ($1, 2020, $2, $3, '사원', '멘토', $4, true, 3)`,
        [userId, major, company, skills]
      );
    }

    await query(`DELETE FROM field_trip_applications WHERE user_id = ANY($1::int[])`, [[
      accounts.studentA.id, accounts.studentB.id,
    ]]);
    await query(`DELETE FROM field_trips WHERE title LIKE 'S4 %'`);
    await query(`DELETE FROM job_recommendations WHERE user_id = ANY($1::int[])`, [[
      accounts.studentA.id, accounts.studentB.id,
    ]]);
    await query(`DELETE FROM job_applications WHERE user_id = ANY($1::int[])`, [[
      accounts.studentA.id, accounts.studentB.id,
    ]]);
    await query(`DELETE FROM jobs WHERE title LIKE 'S4 %'`);
    await query(`DELETE FROM resume_items WHERE resume_id IN (SELECT id FROM resumes WHERE user_id = ANY($1::int[]))`, [[
      accounts.studentA.id, accounts.studentB.id,
    ]]);
    await query(`DELETE FROM resumes WHERE user_id = ANY($1::int[])`, [[
      accounts.studentA.id, accounts.studentB.id,
    ]]);
    await query(`DELETE FROM connections WHERE requester_id = ANY($1::int[]) OR receiver_id = ANY($1::int[])`, [[
      accounts.studentA.id, accounts.studentB.id, accounts.gradA.id, accounts.gradB.id,
    ]]);

    const resumeA = await query(
      `INSERT INTO resumes (user_id, school_id, title, is_primary, status, basic_info, summary)
       VALUES ($1, $2, 'S4이력서A', true, 'published',
               '{"location":"전주","major":"기계과","desired_job":"용접기술자"}'::jsonb,
               '용접 CNC 기계 직무 희망')
       RETURNING id`,
      [accounts.studentA.id, schoolA.id]
    );
    await query(
      `INSERT INTO resume_items (resume_id, section, payload, sort_order)
       VALUES ($1, 'skill', '{"name":"용접"}'::jsonb, 0),
              ($1, 'skill', '{"name":"CNC"}'::jsonb, 1)`,
      [resumeA.rows[0].id]
    );

    jobA = (await query(
      `INSERT INTO jobs (company_id, title, description, requirements, location, job_type, status, school_id, deadline)
       VALUES ($1, 'S4 전주 용접 채용', '용접 CNC 숙련자 모집 기계과 우대', '용접 CNC', '전주', 'full-time', 'active', $2, CURRENT_DATE + 5)
       RETURNING *`,
      [accounts.teacherA.id, schoolA.id]
    )).rows[0];
    jobB = (await query(
      `INSERT INTO jobs (company_id, title, description, requirements, location, job_type, status, school_id, deadline)
       VALUES ($1, 'S4 군산 전기 채용', 'PLC 전기 설비', 'PLC', '군산', 'full-time', 'active', $2, CURRENT_DATE + 30)
       RETURNING *`,
      [accounts.gradB.id, schoolB.id]
    )).rows[0];

    tripA = (await query(
      `INSERT INTO field_trips (school_id, company_name, title, description, place, event_date, capacity, deadline, mode)
       VALUES ($1, '현대중공업', 'S4 A교 견학', '공장 투어', '군산', CURRENT_DATE + 20, 2, CURRENT_DATE + 10, 'fifo')
       RETURNING *`,
      [schoolA.id]
    )).rows[0];
    tripB = (await query(
      `INSERT INTO field_trips (school_id, company_name, title, description, place, event_date, capacity, deadline, mode)
       VALUES ($1, 'LG전자', 'S4 B교 견학', '스마트팩토리', '창원', CURRENT_DATE + 25, 10, CURRENT_DATE + 15, 'approval')
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

  test('REQ-REC scoring factors produce skill and deadline reasons', () => {
    const profile = extractResumeProfile(
      { summary: '용접 CNC', title: '이력서', basic_info: { location: '전주', major: '기계과' } },
      [{ section: 'skill', payload: { name: '용접' } }]
    );
    const scored = scoreJob(profile, {
      title: '용접 채용',
      description: '기계과 우대 CNC',
      requirements: '용접',
      location: '전주',
      deadline: new Date(Date.now() + 3 * 86400000),
      created_at: new Date(),
    });
    assert.ok(scored.score > 0.1);
    const codes = scored.reasons.map((r) => r.code);
    assert.ok(codes.includes('skill_overlap') || codes.includes('location_match'));
  });

  test('REQ-REC-004/005 recommendations/me returns school-scoped scored feed', async () => {
    const token = await login('qa.s4.student.a@jjob.test');
    const recompute = await jsonRequest('POST', '/api/recommendations/recompute', { token });
    assert.equal(recompute.status, 200, JSON.stringify(recompute.data));
    const { status, data } = await jsonRequest('GET', '/api/recommendations/me?limit=10', { token });
    assert.equal(status, 200, JSON.stringify(data));
    assert.ok(Array.isArray(data.recommendations));
    const ids = data.recommendations.map((r) => r.job_id);
    assert.ok(ids.includes(jobA.id), 'should include school A job');
    assert.ok(!ids.includes(jobB.id), 'must not include other school job');
    if (data.recommendations.length) {
      assert.ok(data.recommendations[0].reasons != null);
    }
  });

  test('REQ-IAM-009 networking connect cross-school returns 403', async () => {
    const token = await login('qa.s4.student.a@jjob.test');
    const { status, data } = await jsonRequest('POST', `/api/networking/connect/${accounts.studentB.id}`, {
      token,
      body: { message: 'hi' },
    });
    assert.equal(status, 403, JSON.stringify(data));
  });

  test('REQ-IAM-009 networking mentors are school-scoped', async () => {
    const tokenA = await login('qa.s4.student.a@jjob.test');
    const tokenB = await login('qa.s4.student.b@jjob.test');
    const a = await jsonRequest('GET', '/api/networking/mentors', { token: tokenA });
    const b = await jsonRequest('GET', '/api/networking/mentors', { token: tokenB });
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    const idsA = (a.data.mentors || []).map((m) => m.id);
    const idsB = (b.data.mentors || []).map((m) => m.id);
    assert.ok(idsA.includes(accounts.gradA.id));
    assert.ok(!idsA.includes(accounts.gradB.id));
    assert.ok(idsB.includes(accounts.gradB.id));
    assert.ok(!idsB.includes(accounts.gradA.id));
  });

  test('REQ-TRP-001/002 field-trips list school-scoped and cross-school apply 403', async () => {
    const tokenA = await login('qa.s4.student.a@jjob.test');
    const tokenB = await login('qa.s4.student.b@jjob.test');
    const listA = await jsonRequest('GET', '/api/field-trips', { token: tokenA });
    assert.equal(listA.status, 200);
    const titles = (listA.data.field_trips || []).map((t) => t.title);
    assert.ok(titles.includes('S4 A교 견학'));
    assert.ok(!titles.includes('S4 B교 견학'));

    const cross = await jsonRequest('POST', `/api/field-trips/${tripB.id}/apply`, {
      token: tokenA,
      body: { applicant_name: '학생A', applicant_phone: '01011112222' },
    });
    assert.equal(cross.status, 403, JSON.stringify(cross.data));

    const ok = await jsonRequest('POST', `/api/field-trips/${tripA.id}/apply`, {
      token: tokenA,
      body: { applicant_name: '학생A', applicant_phone: '01011112222' },
    });
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    assert.equal(ok.data.application.status, 'approved');

    const ok2 = await jsonRequest('POST', `/api/field-trips/${tripA.id}/apply`, {
      token: tokenB,
      body: { applicant_name: '학생B', applicant_phone: '01033334444' },
    });
    assert.equal(ok2.status, 403);
  });

  test('REQ-TRP-002 capacity rejects over capacity', async () => {
    const tokenA = await login('qa.s4.student.a@jjob.test');
    // fill remaining seat with teacher acting as second applicant via direct insert then third apply
    await query(
      `INSERT INTO field_trip_applications (trip_id, user_id, school_id, applicant_name, applicant_phone, status)
       VALUES ($1, $2, $3, '교사A', '01099998888', 'approved')
       ON CONFLICT (trip_id, user_id) DO UPDATE SET status = 'approved'`,
      [tripA.id, accounts.teacherA.id, schoolA.id]
    );
    await query(
      `UPDATE field_trips SET current_applicants = (
         SELECT COUNT(*) FROM field_trip_applications WHERE trip_id = $1 AND status IN ('pending','approved')
       ) WHERE id = $1`,
      [tripA.id]
    );

    // create another same-school student
    const studentA2 = await upsertUser({
      email: 'qa.s4.student.a2@jjob.test', name: 'S4학생A2', user_type: 'student', school_id: schoolA.id,
    });
    const tokenA2 = await login('qa.s4.student.a2@jjob.test');
    const over = await jsonRequest('POST', `/api/field-trips/${tripA.id}/apply`, {
      token: tokenA2,
      body: { applicant_name: '학생A2', applicant_phone: '01055556666' },
    });
    assert.equal(over.status, 400, JSON.stringify(over.data));
    assert.equal(over.data.code, 'CAPACITY');
    void studentA2;
  });

  test('REQ-TRP-003 roster and attendance are school-scoped', async () => {
    const teacherToken = await login('qa.s4.teacher.a@jjob.test');
    const rosterOk = await jsonRequest('GET', `/api/field-trips/${tripA.id}/roster`, { token: teacherToken });
    assert.equal(rosterOk.status, 200, JSON.stringify(rosterOk.data));
    assert.ok((rosterOk.data.roster || []).length >= 1);

    const rosterCross = await jsonRequest('GET', `/api/field-trips/${tripB.id}/roster`, { token: teacherToken });
    assert.equal(rosterCross.status, 403);

    const appId = rosterOk.data.roster[0].id;
    const att = await jsonRequest('PATCH', `/api/field-trips/${tripA.id}/attendance`, {
      token: teacherToken,
      body: { items: [{ application_id: appId, attendance: 'present' }] },
    });
    assert.equal(att.status, 200, JSON.stringify(att.data));
  });
});
