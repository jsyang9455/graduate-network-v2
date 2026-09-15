'use strict';

/**
 * Policy decisions from persona E2E Q1–Q7 (2026-09-15)
 * REQ-IAM-004/006/008, REQ-JOB-007, REQ-PLT-002
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'policy-decisions-test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '1d';
process.env.DISABLE_CRON = '1';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { query, pool } = require('../config/database');
const { applyPendingMigrations } = require('../scripts/apply-migrations');
const { displayRoleLabel, displayRoleBadgeKey, canonicalRole } = require('../lib/roles');
const { appendJobSchoolFilter, canSeeJob } = require('../lib/jobAccess');
const app = require('../server');

let server;
let baseUrl;
const stamp = Date.now();
const PASSWORD = 'password123'; // 11 chars — meets min 8

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

describe('Policy decisions (Q1–Q7)', { timeout: 120000 }, () => {
  let schoolA;
  let schoolB;
  let sysToken;
  let schoolAdminToken;
  let teacherToken;
  let studentToken;
  let nullJobId;
  let schoolJobId;
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
        [`QA_POL_${stamp}`, `정책테스트고_${stamp}`]
      );
      schoolB = ins.rows[0];
    }

    const hash = await bcrypt.hash(PASSWORD, 10);

    async function upsertStaff(email, name, user_type, school_id) {
      const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
      let id;
      if (existing.rows.length) {
        id = existing.rows[0].id;
        await query(
          `UPDATE users SET password_hash=$1, name=$2, user_type=$3, school_id=$4, is_active=true
           WHERE id=$5`,
          [hash, name, user_type, school_id, id]
        );
      } else {
        const u = await query(
          `INSERT INTO users (email, password_hash, name, user_type, school_id, is_active)
           VALUES ($1,$2,$3,$4,$5,true) RETURNING id`,
          [email, hash, name, user_type, school_id]
        );
        id = u.rows[0].id;
      }
      createdUserIds.push(id);
      const roleCode = user_type === 'admin' ? 'system_admin' : user_type;
      const role = await query('SELECT id FROM roles WHERE code = $1', [roleCode]);
      if (role.rows.length) {
        await query(
          `INSERT INTO user_roles (user_id, role_id, school_id)
           VALUES ($1,$2,$3)
           ON CONFLICT DO NOTHING`,
          [id, role.rows[0].id, user_type === 'admin' ? null : school_id]
        );
      }
      return id;
    }

    await upsertStaff(`qa.pol.sys.${stamp}@jjob.test`, '정책시스템', 'admin', schoolA.id);
    await upsertStaff(`qa.pol.sa.${stamp}@jjob.test`, '정책학교관리', 'school_admin', schoolA.id);
    await upsertStaff(`qa.pol.tea.${stamp}@jjob.test`, '정책교사', 'teacher', schoolA.id);
    await upsertStaff(`qa.pol.stu.${stamp}@jjob.test`, '정책학생', 'student', schoolA.id);

    // Company for null-school job
    const co = await query(
      `INSERT INTO users (email, password_hash, name, user_type, school_id, is_active)
       VALUES ($1,$2,'정책널기업','company',$3,true) RETURNING id`,
      [`qa.pol.co.${stamp}@jjob.test`, hash, schoolA.id]
    );
    createdUserIds.push(co.rows[0].id);

    const nullJob = await query(
      `INSERT INTO jobs (company_id, title, description, location, job_type, status, deadline, school_id)
       VALUES ($1, '널스쿨공고', 'x', '전주', 'full-time', 'active', '2026-12-31', NULL)
       RETURNING id`,
      [co.rows[0].id]
    );
    nullJobId = nullJob.rows[0].id;

    const scopedJob = await query(
      `INSERT INTO jobs (company_id, title, description, location, job_type, status, deadline, school_id)
       VALUES ($1, '동교공고', 'x', '전주', 'full-time', 'active', '2026-12-31', $2)
       RETURNING id`,
      [co.rows[0].id, schoolA.id]
    );
    schoolJobId = scopedJob.rows[0].id;

    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    async function login(email) {
      const r = await jsonRequest('POST', '/api/auth/login', {
        body: { email, password: PASSWORD },
      });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      return r.data.token;
    }

    sysToken = await login(`qa.pol.sys.${stamp}@jjob.test`);
    schoolAdminToken = await login(`qa.pol.sa.${stamp}@jjob.test`);
    teacherToken = await login(`qa.pol.tea.${stamp}@jjob.test`);
    studentToken = await login(`qa.pol.stu.${stamp}@jjob.test`);
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (nullJobId) await query('DELETE FROM jobs WHERE id = $1', [nullJobId]);
    if (schoolJobId) await query('DELETE FROM jobs WHERE id = $1', [schoolJobId]);
    for (const id of createdUserIds) {
      await query('DELETE FROM audit_logs WHERE actor_id = $1', [id]);
      await query('DELETE FROM company_profiles WHERE user_id = $1', [id]);
      await query('DELETE FROM user_roles WHERE user_id = $1', [id]);
      await query('DELETE FROM users WHERE id = $1', [id]);
    }
  });

  test('password minimum is 8 (register rejects 7)', async () => {
    const r = await jsonRequest('POST', '/api/auth/register', {
      body: {
        email: `qa.pol.pw7.${stamp}@jjob.test`,
        password: 'pass123', // 7
        name: '짧은비번',
        user_type: 'student',
        school_id: schoolA.id,
        graduation_year: 2026,
      },
    });
    assert.equal(r.status, 400, JSON.stringify(r.data));
  });

  test('change-password rejects under 8', async () => {
    const r = await jsonRequest('POST', '/api/auth/change-password', {
      token: studentToken,
      body: { currentPassword: PASSWORD, newPassword: 'short1' },
    });
    assert.equal(r.status, 400, JSON.stringify(r.data));
  });

  test('graduate without school is rejected', async () => {
    const r = await jsonRequest('POST', '/api/auth/register', {
      body: {
        email: `qa.pol.grad.noschool.${stamp}@jjob.test`,
        password: PASSWORD,
        name: '무학교졸업',
        user_type: 'graduate',
        graduation_year: 2022,
      },
    });
    assert.equal(r.status, 400, JSON.stringify(r.data));
  });

  test('student without graduation_year is rejected', async () => {
    const r = await jsonRequest('POST', '/api/auth/register', {
      body: {
        email: `qa.pol.stu.nogy.${stamp}@jjob.test`,
        password: PASSWORD,
        name: '무졸업예정',
        user_type: 'student',
        school_id: schoolA.id,
      },
    });
    assert.equal(r.status, 400, JSON.stringify(r.data));
  });

  test('jobs with school_id NULL are not listed for school users', async () => {
    const list = await jsonRequest('GET', '/api/jobs?limit=100', { token: studentToken });
    assert.equal(list.status, 200, JSON.stringify(list.data));
    const ids = (list.data.jobs || []).map((j) => Number(j.id));
    assert.ok(!ids.includes(Number(nullJobId)), 'null-school job must not appear');
    assert.ok(ids.includes(Number(schoolJobId)), 'same-school job should appear');

    const unit = appendJobSchoolFilter('SELECT * FROM jobs j WHERE 1=1', [], 0, {
      user_type: 'student',
      school_id: schoolA.id,
    });
    assert.ok(!unit.queryText.includes('IS NULL'));
    assert.equal(canSeeJob({ user_type: 'student', school_id: schoolA.id }, {
      id: nullJobId, school_id: null, company_id: 0,
    }), false);
  });

  test('system_admin can list null-school jobs; student cannot GET detail', async () => {
    const sysList = await jsonRequest('GET', '/api/jobs?limit=100', { token: sysToken });
    assert.equal(sysList.status, 200);
    const ids = (sysList.data.jobs || []).map((j) => Number(j.id));
    assert.ok(ids.includes(Number(nullJobId)));

    const detail = await jsonRequest('GET', `/api/jobs/${nullJobId}`, { token: studentToken });
    assert.ok([403, 404].includes(detail.status), `expected hide, got ${detail.status}`);
  });

  test('company_approval permission is configurable; teacher denied until granted', async () => {
    // Default: teacher cannot approve
    const denied = await jsonRequest('GET', '/api/users/companies?approval_status=pending', {
      token: teacherToken,
    });
    assert.equal(denied.status, 403, JSON.stringify(denied.data));

    // system_admin grants teacher company_approval write
    const put = await jsonRequest('PUT', '/api/roles/teacher/permissions', {
      token: sysToken,
      body: { permissions: { company_approval: ['write', 'read', 'apply'] } },
    });
    assert.equal(put.status, 200, JSON.stringify(put.data));
    assert.ok((put.data.permissions.company_approval || []).includes('write'));

    const allowed = await jsonRequest('GET', '/api/users/companies?approval_status=pending', {
      token: teacherToken,
    });
    assert.equal(allowed.status, 200, JSON.stringify(allowed.data));

    // Revoke
    const revoke = await jsonRequest('PUT', '/api/roles/teacher/permissions', {
      token: sysToken,
      body: { permissions: { company_approval: [] } },
    });
    assert.equal(revoke.status, 200, JSON.stringify(revoke.data));

    const deniedAgain = await jsonRequest('GET', '/api/users/companies', { token: teacherToken });
    assert.equal(deniedAgain.status, 403);

    // school_admin still has default
    const sa = await jsonRequest('GET', '/api/users/companies', { token: schoolAdminToken });
    assert.equal(sa.status, 200, JSON.stringify(sa.data));
  });

  test('displayRoleLabel maps admin → 시스템 관리자 / system_admin', () => {
    assert.equal(displayRoleLabel('admin'), '시스템 관리자');
    assert.equal(displayRoleLabel({ user_type: 'admin' }), '시스템 관리자');
    assert.equal(displayRoleLabel({ user_type: 'system_admin' }), '시스템 관리자');
    assert.equal(canonicalRole({ user_type: 'admin' }), 'system_admin');
    assert.equal(displayRoleBadgeKey('admin'), 'system_admin');
    assert.equal(displayRoleLabel('school_admin'), '학교 관리자');
  });

  test('019 policy: mass Jeonju bind not re-applied; null company stays null', async () => {
    const hash = await bcrypt.hash(PASSWORD, 10);
    const email = `qa.pol.nullco.${stamp}@jjob.test`;
    const u = await query(
      `INSERT INTO users (email, password_hash, name, user_type, school_id, is_active)
       VALUES ($1,$2,'널기업','company',NULL,true) RETURNING id`,
      [email, hash]
    );
    createdUserIds.push(u.rows[0].id);

    // Re-run 018 body (DX-only) — must NOT bind this orphan to Jeonju
    const fs = require('fs');
    const path = require('path');
    const sql018 = fs.readFileSync(
      path.join(__dirname, '../../database/migrations/018_v2_legacy_company_seed_repair.sql'),
      'utf8'
    );
    await pool.query(sql018);

    const row = await query('SELECT school_id FROM users WHERE id = $1', [u.rows[0].id]);
    assert.equal(row.rows[0].school_id, null);
  });
});
