'use strict';

/**
 * Full persona E2E campaign (API-level).
 * REQ-IAM-006/008/009, REQ-RSM-*, REQ-JOB-*, REQ-CNS-*, REQ-PLT-002, REQ-JOB-007
 *
 * Covers: student, graduate, teacher, company (pending→approve→job),
 * school_admin, system_admin (v1 admin mapped), cross-school 403,
 * gated Worknet/Alimtalk NOT_CONFIGURED.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'persona-e2e-campaign-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '1d';
process.env.DISABLE_CRON = '1';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = require('path').join(__dirname, '../../tmp-test-uploads-persona-e2e');
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
const PASSWORD = 'password123';
const stamp = Date.now();
const emails = {
  student: `qa.pe2e.student.${stamp}@jjob.test`,
  graduate: `qa.pe2e.graduate.${stamp}@jjob.test`,
  teacher: `qa.pe2e.teacher.${stamp}@jjob.test`,
  company: `qa.pe2e.company.${stamp}@jjob.test`,
  schoolAdmin: `qa.pe2e.sadmin.${stamp}@jjob.test`,
  schoolAdminB: `qa.pe2e.sadmin.b.${stamp}@jjob.test`,
  systemAdmin: `qa.pe2e.sysadmin.${stamp}@jjob.test`,
  studentB: `qa.pe2e.student.b.${stamp}@jjob.test`,
};
const ids = {};
const tokens = {};
const artifacts = {};

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

async function upsertStaff({ email, name, user_type, school_id }) {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  let user;
  if (existing.rows.length) {
    user = (await query(
      `UPDATE users SET password_hash = $1, name = $2, user_type = $3, school_id = $4, is_active = true
       WHERE email = $5 RETURNING *`,
      [hash, name, user_type, school_id, email]
    )).rows[0];
  } else {
    user = (await query(
      `INSERT INTO users (email, password_hash, name, user_type, school_id, is_active)
       VALUES ($1, $2, $3, $4, $5, true) RETURNING *`,
      [email, hash, name, user_type, school_id]
    )).rows[0];
  }
  const roleCode = user_type === 'admin' ? 'system_admin' : user_type;
  const role = await query(`SELECT id FROM roles WHERE code = $1`, [roleCode]);
  if (role.rows.length) {
    await query(
      `INSERT INTO user_roles (user_id, role_id, school_id)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [user.id, role.rows[0].id, user_type === 'admin' ? null : school_id]
    );
  }
  return user;
}

async function login(email) {
  const { status, data } = await jsonRequest('POST', '/api/auth/login', {
    body: { email, password: PASSWORD },
  });
  assert.equal(status, 200, `login failed for ${email}: ${JSON.stringify(data)}`);
  return data.token;
}

describe('Persona E2E campaign (all roles)', { timeout: 180000 }, () => {
  before(async () => {
    await ensureUsersTable();
    await applyPendingMigrations();

    const a = await query(`SELECT * FROM schools WHERE name = '전주공업고등학교' LIMIT 1`);
    if (!a.rows.length) throw new Error('Default school missing');
    schoolA = a.rows[0];

    await query(
      `INSERT INTO schools (code, name, region, status)
       VALUES ('PE2B', '페르소나E2E학교B', '전북', 'active')
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, status = 'active'`
    );
    schoolB = (await query(`SELECT * FROM schools WHERE code = 'PE2B'`)).rows[0];

    const sa = await upsertStaff({
      email: emails.schoolAdmin, name: 'PE2E학교관리자A', user_type: 'school_admin', school_id: schoolA.id,
    });
    ids.schoolAdmin = sa.id;
    const sab = await upsertStaff({
      email: emails.schoolAdminB, name: 'PE2E학교관리자B', user_type: 'school_admin', school_id: schoolB.id,
    });
    ids.schoolAdminB = sab.id;
    const sys = await upsertStaff({
      email: emails.systemAdmin, name: 'PE2E시스템관리자', user_type: 'admin', school_id: schoolA.id,
    });
    ids.systemAdmin = sys.id;

    const studentB = await upsertStaff({
      email: emails.studentB, name: 'PE2E타교학생', user_type: 'student', school_id: schoolB.id,
    });
    ids.studentB = studentB.id;

    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    const allEmails = Object.values(emails);
    try {
      await query(
        `DELETE FROM job_applications WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))
          OR job_id IN (SELECT id FROM jobs WHERE company_id IN (SELECT id FROM users WHERE email = ANY($1::text[])))`,
        [allEmails]
      );
      await query(`DELETE FROM job_scraps WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))`, [allEmails]);
      await query(`DELETE FROM post_scraps WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))`, [allEmails]);
      await query(
        `DELETE FROM posts WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))`,
        [allEmails]
      );
      await query(
        `DELETE FROM resumes WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))`,
        [allEmails]
      );
      await query(
        `DELETE FROM counseling_journals WHERE teacher_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))
          OR student_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))`,
        [allEmails]
      );
      await query(
        `DELETE FROM jobs WHERE company_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))`,
        [allEmails]
      );
      await query(
        `DELETE FROM company_profiles WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))`,
        [allEmails]
      );
      await query(`DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1::text[]))`, [allEmails]);
      await query(`DELETE FROM users WHERE email = ANY($1::text[])`, [allEmails]);
    } catch (err) {
      console.warn('persona-e2e cleanup:', err.message);
    }
  });

  // ─── Student ───────────────────────────────────────────────
  test('student: register → login → me → change-password → resume → scrap → apply', async () => {
    const reg = await jsonRequest('POST', '/api/auth/register', {
      body: {
        email: emails.student,
        password: PASSWORD,
        name: 'PE2E재학생',
        user_type: 'student',
        school_id: schoolA.id,
        major: '기계과',
        phone: '010-1000-0001',
        graduation_year: 2026,
      },
    });
    assert.equal(reg.status, 201, JSON.stringify(reg.data));
    assert.equal(reg.data.user.user_type, 'student');
    assert.equal(Number(reg.data.user.school_id), Number(schoolA.id));
    ids.student = reg.data.user.id;
    tokens.student = reg.data.token;

    const me = await jsonRequest('GET', '/api/auth/me', { token: tokens.student });
    assert.equal(me.status, 200, JSON.stringify(me.data));
    assert.equal(me.data.user.email, emails.student);

    const badPw = await jsonRequest('POST', '/api/auth/change-password', {
      token: tokens.student,
      body: { currentPassword: 'wrong-password', newPassword: 'password456' },
    });
    assert.equal(badPw.status, 401);

    const chg = await jsonRequest('POST', '/api/auth/change-password', {
      token: tokens.student,
      body: { currentPassword: PASSWORD, newPassword: 'password456' },
    });
    assert.equal(chg.status, 200, JSON.stringify(chg.data));

    const loginNew = await jsonRequest('POST', '/api/auth/login', {
      body: { email: emails.student, password: 'password456' },
    });
    assert.equal(loginNew.status, 200);
    tokens.student = loginNew.data.token;

    // restore password for rest of suite
    const restore = await jsonRequest('POST', '/api/auth/change-password', {
      token: tokens.student,
      body: { currentPassword: 'password456', newPassword: PASSWORD },
    });
    assert.equal(restore.status, 200);
    tokens.student = await login(emails.student);

    const resume = await jsonRequest('POST', '/api/resumes', {
      token: tokens.student,
      body: { title: 'PE2E 학생 이력서', summary: '용접 희망', skills: ['용접'] },
    });
    assert.equal(resume.status, 201, JSON.stringify(resume.data));
    artifacts.resumeId = resume.data.resume.id;

    const jobs = await jsonRequest('GET', '/api/jobs?limit=20', { token: tokens.student });
    assert.equal(jobs.status, 200, JSON.stringify(jobs.data));
  });

  // ─── Graduate ──────────────────────────────────────────────
  test('graduate: register → profile/me → resume list', async () => {
    const reg = await jsonRequest('POST', '/api/auth/register', {
      body: {
        email: emails.graduate,
        password: PASSWORD,
        name: 'PE2E졸업생',
        user_type: 'graduate',
        school_id: schoolA.id,
        major: '전자과',
        graduation_year: 2022,
      },
    });
    assert.equal(reg.status, 201, JSON.stringify(reg.data));
    ids.graduate = reg.data.user.id;
    tokens.graduate = reg.data.token;

    const me = await jsonRequest('GET', '/api/auth/me', { token: tokens.graduate });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.user_type, 'graduate');

    const resumes = await jsonRequest('GET', '/api/resumes', { token: tokens.graduate });
    assert.equal(resumes.status, 200, JSON.stringify(resumes.data));

    // Graduate without school should fail (current API requires school for graduate)
    const noschool = await jsonRequest('POST', '/api/auth/register', {
      body: {
        email: `qa.pe2e.grad.noschool.${stamp}@jjob.test`,
        password: PASSWORD,
        name: '무학교졸업',
        user_type: 'graduate',
      },
    });
    assert.equal(noschool.status, 400, JSON.stringify(noschool.data));
  });

  // ─── Teacher ───────────────────────────────────────────────
  test('teacher: register → counseling journal → list scoped', async () => {
    const reg = await jsonRequest('POST', '/api/auth/register', {
      body: {
        email: emails.teacher,
        password: PASSWORD,
        name: 'PE2E교사',
        user_type: 'teacher',
        school_id: schoolA.id,
      },
    });
    assert.equal(reg.status, 201, JSON.stringify(reg.data));
    ids.teacher = reg.data.user.id;
    tokens.teacher = reg.data.token;

    assert.ok(ids.student, 'student must exist before counseling');
    const journal = await jsonRequest('POST', '/api/counseling-journals', {
      token: tokens.teacher,
      body: {
        student_id: ids.student,
        student_name: 'PE2E재학생',
        counseling_date: '2026-09-15',
        type: '취업상담',
        title: 'PE2E 상담일지',
        content: '진로 상담 진행',
        follow_up: '이력서 보완',
        follow_up_at: '2026-09-22',
      },
    });
    assert.equal(journal.status, 201, JSON.stringify(journal.data));
    artifacts.journalId = journal.data.journal?.id || journal.data.id;

    const list = await jsonRequest('GET', '/api/counseling-journals', { token: tokens.teacher });
    assert.equal(list.status, 200, JSON.stringify(list.data));

    // Cross-school: teacher A cannot timeline student B
    const denied = await jsonRequest('GET', `/api/counseling-journals/timeline/${ids.studentB}`, {
      token: tokens.teacher,
    });
    assert.ok([403, 404].includes(denied.status), `expected 403/404 got ${denied.status}`);
  });

  // ─── Company pending → school_admin approve → jobs ─────────
  test('company: register pending → profile OK → job 403 → school_admin approve → job 201', async () => {
    const reg = await jsonRequest('POST', '/api/auth/register', {
      body: {
        email: emails.company,
        password: PASSWORD,
        name: 'PE2E기업담당',
        user_type: 'company',
        school_id: schoolA.id,
        company_name: 'PE2E테스트기업',
        industry: '제조',
      },
    });
    assert.equal(reg.status, 201, JSON.stringify(reg.data));
    assert.equal(reg.data.company_profile.approval_status, 'pending');
    ids.company = reg.data.user.id;
    tokens.company = reg.data.token;

    const profile = await jsonRequest('GET', '/api/users/company-profile', { token: tokens.company });
    assert.equal(profile.status, 200);
    assert.equal(profile.data.profile.approval_status, 'pending');

    const put = await jsonRequest('PUT', '/api/users/company-profile', {
      token: tokens.company,
      body: { company_name: 'PE2E테스트기업', description: '승인 전 프로필 수정', industry: '제조' },
    });
    assert.ok([200, 201].includes(put.status), JSON.stringify(put.data));

    const blocked = await jsonRequest('POST', '/api/jobs', {
      token: tokens.company,
      body: {
        title: 'PE2E 미승인 공고',
        description: '막혀야 함',
        location: '전주',
        job_type: 'full-time',
        deadline: '2026-12-31',
      },
    });
    assert.equal(blocked.status, 403, JSON.stringify(blocked.data));
    assert.equal(blocked.data.code, 'COMPANY_NOT_APPROVED');

    // Teacher cannot approve by default (company_approval not granted until system_admin configures)
    tokens.teacher = tokens.teacher || await login(emails.teacher);
    const teacherTry = await jsonRequest('PATCH', `/api/users/${ids.company}/company-approval`, {
      token: tokens.teacher,
      body: { status: 'approved' },
    });
    assert.ok([401, 403].includes(teacherTry.status), `teacher approve should fail, got ${teacherTry.status}`);

    // Cross-school school_admin B cannot approve
    tokens.schoolAdminB = await login(emails.schoolAdminB);
    const cross = await jsonRequest('PATCH', `/api/users/${ids.company}/company-approval`, {
      token: tokens.schoolAdminB,
      body: { status: 'approved' },
    });
    assert.equal(cross.status, 403, JSON.stringify(cross.data));

    tokens.schoolAdmin = await login(emails.schoolAdmin);
    const pendingList = await jsonRequest('GET', '/api/users/companies?approval_status=pending', {
      token: tokens.schoolAdmin,
    });
    assert.equal(pendingList.status, 200, JSON.stringify(pendingList.data));
    assert.ok((pendingList.data.companies || []).some((c) => Number(c.user_id) === Number(ids.company)));

    const appr = await jsonRequest('PATCH', `/api/users/${ids.company}/company-approval`, {
      token: tokens.schoolAdmin,
      body: { status: 'approved' },
    });
    assert.equal(appr.status, 200, JSON.stringify(appr.data));
    assert.equal(appr.data.profile.approval_status, 'approved');

    const job = await jsonRequest('POST', '/api/jobs', {
      token: tokens.company,
      body: {
        title: 'PE2E 승인후 용접공',
        description: '용접',
        requirements: '용접자격',
        location: '전주',
        job_type: 'full-time',
        deadline: '2026-12-31',
        status: 'active',
      },
    });
    assert.equal(job.status, 201, JSON.stringify(job.data));
    artifacts.jobId = job.data.job.id;
    assert.equal(Number(job.data.job.school_id), Number(schoolA.id));
  });

  // ─── Student apply/scrap against approved company job ──────
  test('student: scrap + apply approved company job', async () => {
    tokens.student = await login(emails.student);
    assert.ok(artifacts.jobId, 'job must exist');
    assert.ok(artifacts.resumeId, 'resume must exist');

    const scrap = await jsonRequest('POST', `/api/jobs/${artifacts.jobId}/scrap`, { token: tokens.student });
    assert.ok([200, 201].includes(scrap.status), JSON.stringify(scrap.data));

    const apply = await jsonRequest('POST', `/api/jobs/${artifacts.jobId}/apply`, {
      token: tokens.student,
      body: { resume_id: artifacts.resumeId, cover_letter: 'PE2E 지원합니다' },
    });
    assert.equal(apply.status, 201, JSON.stringify(apply.data));
    artifacts.applicationId = apply.data.application.id;

    const recs = await jsonRequest('GET', '/api/recommendations/me', { token: tokens.student });
    assert.equal(recs.status, 200);
    assert.ok(Array.isArray(recs.data.recommendations));
  });

  // ─── School admin school-scoped users ──────────────────────
  test('school_admin: list users school-scoped; cross-school 403', async () => {
    tokens.schoolAdmin = await login(emails.schoolAdmin);
    const list = await jsonRequest('GET', '/api/users?limit=200', { token: tokens.schoolAdmin });
    assert.equal(list.status, 200, JSON.stringify(list.data));
    const users = list.data.users || [];
    assert.ok(users.some((u) => Number(u.id) === Number(ids.student)));
    assert.equal(users.some((u) => Number(u.id) === Number(ids.studentB)), false);

    const crossGet = await jsonRequest('GET', `/api/users/${ids.studentB}`, { token: tokens.schoolAdmin });
    assert.ok([403, 404].includes(crossGet.status), `expected 403/404 got ${crossGet.status}`);
  });

  // ─── System admin (v1 admin) ───────────────────────────────
  test('system_admin (admin): login → schools list → worknet NOT_CONFIGURED', async () => {
    tokens.systemAdmin = await login(emails.systemAdmin);
    const me = await jsonRequest('GET', '/api/auth/me', { token: tokens.systemAdmin });
    assert.equal(me.status, 200);
    assert.ok(['admin', 'system_admin'].includes(me.data.user.user_type));

    const schools = await jsonRequest('GET', '/api/schools', { token: tokens.systemAdmin });
    assert.equal(schools.status, 200, JSON.stringify(schools.data));
    assert.ok(Array.isArray(schools.data.schools || schools.data));

    const wn = await jsonRequest('GET', '/api/worknet/status', { token: tokens.systemAdmin });
    assert.equal(wn.status, 200, JSON.stringify(wn.data));
    assert.equal(wn.data.code, 'NOT_CONFIGURED');

    const providers = await jsonRequest('GET', '/api/notifications/providers', { token: tokens.systemAdmin });
    assert.equal(providers.status, 200);
    assert.equal(providers.data.alimtalk.code, 'NOT_CONFIGURED');
  });

  // ─── Public signup policy ──────────────────────────────────
  test('public register rejects school_admin and system_admin', async () => {
    for (const t of ['school_admin', 'system_admin', 'admin']) {
      const { status, data } = await jsonRequest('POST', '/api/auth/register', {
        body: {
          email: `qa.pe2e.reject.${t}.${stamp}@jjob.test`,
          password: PASSWORD,
          name: '거절대상',
          user_type: t,
          school_id: schoolA.id,
        },
      });
      assert.ok([400, 403].includes(status), `${t} should be rejected, got ${status}: ${JSON.stringify(data)}`);
    }
  });

  // ─── Cross-school job isolation ────────────────────────────
  test('cross-school: school B student cannot GET school A job detail as foreign if scoped', async () => {
    tokens.studentB = await login(emails.studentB);
    const list = await jsonRequest('GET', '/api/jobs?limit=200', { token: tokens.studentB });
    assert.equal(list.status, 200);
    const idsFound = (list.data.jobs || []).map((j) => Number(j.id));
    // School-scoped listing should not include school A company job for school B student
    assert.equal(idsFound.includes(Number(artifacts.jobId)), false,
      'school B student should not see school A job in list');
  });
});
