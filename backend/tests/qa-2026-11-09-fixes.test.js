'use strict';

/**
 * Regression for docs/qa/comprehensive-test-report-2026-11-09.md backend defects.
 * D1/D3/D4 REQ-IAM-009, REQ-CNS-006 · D2 REQ-JOB-007, REQ-NFR-003 · D12 REQ-PLT-004 · D13 docs/04 §1
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'qa-20261109-test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '1d';
process.env.DISABLE_CRON = '1';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { query } = require('../config/database');
const { applyPendingMigrations } = require('../scripts/apply-migrations');
const app = require('../server');

let server;
let baseUrl;
const stamp = Date.now();
const PASSWORD = 'password123';

async function jsonRequest(method, pathName, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${pathName}`, {
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

describe('QA 2026-11-09 backend fixes (D1–D4, D12, D13)', { timeout: 120000 }, () => {
  let schoolA;
  let schoolB;
  let tempSchoolId;
  let jobId;
  const ids = {};
  const tokens = {};
  const createdUserIds = [];

  before(async () => {
    await applyPendingMigrations();

    const schools = await query(
      `SELECT id, name FROM schools WHERE status = 'active' ORDER BY id LIMIT 2`
    );
    assert.ok(schools.rows.length >= 1, 'need at least one school');
    schoolA = schools.rows[0];
    if (schools.rows.length >= 2) {
      schoolB = schools.rows[1];
    } else {
      const ins = await query(
        `INSERT INTO schools (code, name, region, status)
         VALUES ($1, $2, '전북', 'active') RETURNING id, name`,
        [`QA_1109_B_${stamp}`, `QA1109학교B_${stamp}`]
      );
      schoolB = ins.rows[0];
    }

    const hash = await bcrypt.hash(PASSWORD, 10);
    async function createUser(key, userType, schoolId, extra = {}) {
      const email = `qa.1109.${key.toLowerCase()}.${stamp}@jjob.test`;
      const u = await query(
        `INSERT INTO users (email, password_hash, name, user_type, school_id, phone, is_active, is_counselor)
         VALUES ($1,$2,$3,$4,$5,$6,true,$7) RETURNING id`,
        [email, hash, `QA1109_${key}`, userType, schoolId, '010-1109-0000', Boolean(extra.is_counselor)]
      );
      const id = u.rows[0].id;
      createdUserIds.push(id);
      const role = await query('SELECT id FROM roles WHERE code = $1', [userType]);
      if (role.rows.length) {
        await query(
          `INSERT INTO user_roles (user_id, role_id, school_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [id, role.rows[0].id, schoolId]
        );
      }
      ids[key] = id;
      ids[`${key}Email`] = email;
      return id;
    }

    await createUser('studentA', 'student', schoolA.id);
    await createUser('teacherA', 'teacher', schoolA.id, { is_counselor: true });
    await createUser('teacherA2', 'teacher', schoolA.id, { is_counselor: true });
    await createUser('teacherB', 'teacher', schoolB.id, { is_counselor: true });
    await createUser('graduateA', 'graduate', schoolA.id);
    await createUser('companyPending', 'company', schoolA.id);
    await createUser('companyApproved', 'company', schoolA.id);

    await query(
      `INSERT INTO company_profiles (user_id, company_name, approval_status)
       VALUES ($1, 'QA1109대기기업', 'pending')`,
      [ids.companyPending]
    );
    await query(
      `INSERT INTO company_profiles (user_id, company_name, approval_status, approved_at)
       VALUES ($1, 'QA1109승인기업', 'approved', CURRENT_TIMESTAMP)`,
      [ids.companyApproved]
    );

    const job = await query(
      `INSERT INTO jobs (company_id, title, description, location, job_type, status, deadline, school_id)
       VALUES ($1, 'QA1109공고', 'x', '전주', 'full-time', 'active', '2026-12-31', $2)
       RETURNING id`,
      [ids.companyApproved, schoolA.id]
    );
    jobId = job.rows[0].id;

    const temp = await query(
      `INSERT INTO schools (code, name, region, status)
       VALUES ($1, $2, '전북', 'active') RETURNING id`,
      [`QA_1109_NL_${stamp}`, `QA1109로고없음_${stamp}`]
    );
    tempSchoolId = temp.rows[0].id;

    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    for (const key of ['studentA', 'teacherA', 'teacherA2', 'teacherB', 'graduateA', 'companyPending', 'companyApproved']) {
      const r = await jsonRequest('POST', '/api/auth/login', {
        body: { email: ids[`${key}Email`], password: PASSWORD },
      });
      assert.equal(r.status, 200, `${key} login: ${JSON.stringify(r.data)}`);
      tokens[key] = r.data.token;
    }
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await query('DELETE FROM job_applications WHERE user_id = ANY($1::int[])', [createdUserIds]);
    if (jobId) await query('DELETE FROM jobs WHERE id = $1', [jobId]);
    await query(
      'DELETE FROM counseling_sessions WHERE user_id = ANY($1::int[]) OR counselor_id = ANY($1::int[])',
      [createdUserIds]
    );
    await query('DELETE FROM notifications WHERE user_id = ANY($1::int[])', [createdUserIds]);
    await query('DELETE FROM audit_logs WHERE actor_id = ANY($1::int[])', [createdUserIds]);
    await query('DELETE FROM company_profiles WHERE user_id = ANY($1::int[])', [createdUserIds]);
    await query('DELETE FROM user_roles WHERE user_id = ANY($1::int[])', [createdUserIds]);
    await query('DELETE FROM users WHERE id = ANY($1::int[])', [createdUserIds]);
    if (tempSchoolId) await query('DELETE FROM schools WHERE id = $1', [tempSchoolId]);
  });

  async function bookSession() {
    const r = await jsonRequest('POST', '/api/counseling', {
      token: tokens.studentA,
      body: { counselor_id: ids.teacherA, session_date: '2026-12-01T10:00:00Z', topic: 'QA1109' },
    });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    return r.data.session;
  }

  test('D1 REQ-IAM-009 student cannot reassign counselor to other-school teacher (403)', async () => {
    const session = await bookSession();
    const r = await jsonRequest('PUT', `/api/counseling/${session.id}`, {
      token: tokens.studentA,
      body: { counselor_id: ids.teacherB },
    });
    assert.equal(r.status, 403, JSON.stringify(r.data));
    const row = await query('SELECT counselor_id FROM counseling_sessions WHERE id = $1', [session.id]);
    assert.equal(Number(row.rows[0].counselor_id), Number(ids.teacherA));
  });

  test('D1 REQ-CNS-006 other-school teacher assigned via DB cannot update session (403)', async () => {
    const session = await bookSession();
    await query('UPDATE counseling_sessions SET counselor_id = $1 WHERE id = $2', [ids.teacherB, session.id]);
    const r = await jsonRequest('PUT', `/api/counseling/${session.id}`, {
      token: tokens.teacherB,
      body: { status: 'completed', notes: 'cross-school' },
    });
    assert.equal(r.status, 403, JSON.stringify(r.data));
    const row = await query('SELECT status, notes FROM counseling_sessions WHERE id = $1', [session.id]);
    assert.notEqual(row.rows[0].status, 'completed');
  });

  test('D1 student may reassign to another same-school teacher (200)', async () => {
    const session = await bookSession();
    const r = await jsonRequest('PUT', `/api/counseling/${session.id}`, {
      token: tokens.studentA,
      body: { counselor_id: ids.teacherA2 },
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(Number(r.data.session.counselor_id), Number(ids.teacherA2));
  });

  test('D3 REQ-CNS-006 counselor must be a teacher (graduate → 4xx)', async () => {
    const session = await bookSession();
    const r = await jsonRequest('PUT', `/api/counseling/${session.id}`, {
      token: tokens.studentA,
      body: { counselor_id: ids.graduateA },
    });
    assert.ok(r.status >= 400 && r.status < 500, `expected 4xx got ${r.status}`);
    const list = await jsonRequest('GET', '/api/counseling', { token: tokens.graduateA });
    assert.equal(list.status, 200);
    const sessionIds = (list.data.sessions || []).map((s) => Number(s.id));
    assert.equal(sessionIds.includes(Number(session.id)), false);
  });

  test('D4 REQ-CNS-006 student cannot self-approve (403); assigned teacher approves (200)', async () => {
    const session = await bookSession();
    const self = await jsonRequest('PUT', `/api/counseling/${session.id}`, {
      token: tokens.studentA,
      body: { status: 'approved' },
    });
    assert.equal(self.status, 403, JSON.stringify(self.data));
    assert.equal(self.data.code, 'FORBIDDEN');

    const teacher = await jsonRequest('PUT', `/api/counseling/${session.id}`, {
      token: tokens.teacherA,
      body: { status: 'approved', notes: '승인합니다' },
    });
    assert.equal(teacher.status, 200, JSON.stringify(teacher.data));
    assert.equal(teacher.data.session.status, 'approved');
  });

  test('D4 owner may still cancel own session via PUT (200)', async () => {
    const session = await bookSession();
    const r = await jsonRequest('PUT', `/api/counseling/${session.id}`, {
      token: tokens.studentA,
      body: { status: 'cancelled' },
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.session.status, 'cancelled');
  });

  test('D2 REQ-JOB-007 pending company GET /users and /users/:id → 403 COMPANY_NOT_APPROVED', async () => {
    const list = await jsonRequest('GET', '/api/users?user_type=student', { token: tokens.companyPending });
    assert.equal(list.status, 403, JSON.stringify(list.data));
    assert.equal(list.data.code, 'COMPANY_NOT_APPROVED');

    const one = await jsonRequest('GET', `/api/users/${ids.studentA}`, { token: tokens.companyPending });
    assert.equal(one.status, 403, JSON.stringify(one.data));
    assert.equal(one.data.code, 'COMPANY_NOT_APPROVED');
  });

  test('D2 REQ-NFR-003 approved company sees no student email/phone', async () => {
    const list = await jsonRequest('GET', '/api/users?user_type=student&limit=200', { token: tokens.companyApproved });
    assert.equal(list.status, 200, JSON.stringify(list.data));
    const students = list.data.users || [];
    assert.ok(students.some((u) => Number(u.id) === Number(ids.studentA)), 'fixture student listed');
    for (const u of students) {
      assert.equal(u.email, null, `email leaked for ${u.id}`);
      assert.equal(u.phone, null, `phone leaked for ${u.id}`);
    }

    const one = await jsonRequest('GET', `/api/users/${ids.studentA}`, { token: tokens.companyApproved });
    assert.equal(one.status, 200, JSON.stringify(one.data));
    assert.equal(one.data.user.email, null);
    assert.equal(one.data.user.phone, null);
    assert.equal(one.data.user.name, `QA1109_studentA`);
  });

  test('D2 student sees no peer contact; same-school teacher does', async () => {
    const peer = await jsonRequest('GET', `/api/users/${ids.graduateA}`, { token: tokens.studentA });
    assert.equal(peer.status, 200, JSON.stringify(peer.data));
    assert.equal(peer.data.user.email, null);
    assert.equal(peer.data.user.phone, null);

    const self = await jsonRequest('GET', `/api/users/${ids.studentA}`, { token: tokens.studentA });
    assert.equal(self.data.user.email, ids.studentAEmail);

    const teacher = await jsonRequest('GET', `/api/users/${ids.studentA}`, { token: tokens.teacherA });
    assert.equal(teacher.status, 200);
    assert.equal(teacher.data.user.email, ids.studentAEmail);
    assert.equal(teacher.data.user.phone, '010-1109-0000');
  });

  test('D2 include_withdrawn=true is staff-admin only (student → 403)', async () => {
    const r = await jsonRequest('GET', '/api/users?include_withdrawn=true', { token: tokens.studentA });
    assert.equal(r.status, 403, JSON.stringify(r.data));
  });

  test('D12 REQ-PLT-004 school without logo → 204; unknown school → 404', async () => {
    const res = await fetch(`${baseUrl}/api/schools/${tempSchoolId}/logo`);
    assert.equal(res.status, 204);
    const missing = await fetch(`${baseUrl}/api/schools/99999999/logo`);
    assert.equal(missing.status, 404);
  });

  test('D13 duplicate email register → 409 CONFLICT', async () => {
    const r = await jsonRequest('POST', '/api/auth/register', {
      body: {
        email: ids.studentAEmail,
        password: PASSWORD,
        name: '중복',
        user_type: 'student',
        school_id: schoolA.id,
        graduation_year: 2026,
      },
    });
    assert.equal(r.status, 409, JSON.stringify(r.data));
    assert.equal(r.data.code, 'CONFLICT');
  });

  test('D13 duplicate job apply → 409 CONFLICT', async () => {
    const first = await jsonRequest('POST', `/api/jobs/${jobId}/apply`, { token: tokens.studentA, body: {} });
    assert.equal(first.status, 201, JSON.stringify(first.data));
    const dup = await jsonRequest('POST', `/api/jobs/${jobId}/apply`, { token: tokens.studentA, body: {} });
    assert.equal(dup.status, 409, JSON.stringify(dup.data));
    assert.equal(dup.data.code, 'CONFLICT');
    assert.match(dup.data.error, /Already applied/);
  });
});
