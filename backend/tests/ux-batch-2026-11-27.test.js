'use strict';

/**
 * 2026-11-27 UX 일괄 수정 회귀 (REQ-IAM-001, REQ-IAM-006, REQ-PLT-001)
 * - 학교 등록 주 담당자 선택
 * - 졸업생 가입 개인정보 동의 필수 + 관리자 동의서 조회(학교 범위)
 * - 기업 가입 사업자번호·산업·직원수
 * - 교육프로그램 신청 / 신청자 조회 권한 (등록 교사·관리자만, 타교 403)
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'ux-test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '1d';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { query } = require('../config/database');
const { applyPendingMigrations } = require('../scripts/apply-migrations');
const app = require('../server');

let server;
let baseUrl;
const PASSWORD = 'password123';
const stamp = Date.now();
const EMAIL_LIKE = `uxb.%${stamp}@jjob.test`;
const SCHOOL_CODE_LIKE = `UXB${String(stamp).slice(-6)}%`;
const schools = {};
const accounts = {};
const tokens = {};
const state = {};

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

async function upsertUser(key, { user_type, school_id, role }) {
  const email = `uxb.${key.toLowerCase()}.${stamp}@jjob.test`;
  const hash = await bcrypt.hash(PASSWORD, 10);
  const result = await query(
    `INSERT INTO users (email, password_hash, name, user_type, school_id, is_active, phone)
     VALUES ($1, $2, $3, $4, $5, true, '01000000000')
     RETURNING *`,
    [email, hash, `UXB-${key}`, user_type, school_id]
  );
  const user = result.rows[0];
  const roleRow = await query('SELECT id FROM roles WHERE code = $1', [role]);
  if (roleRow.rows.length) {
    await query(
      'INSERT INTO user_roles (user_id, role_id, school_id) VALUES ($1, $2, $3)',
      [user.id, roleRow.rows[0].id, role === 'system_admin' ? null : school_id]
    );
  }
  accounts[key] = user;
  return user;
}

async function login(key) {
  const { status, data } = await jsonRequest('POST', '/api/auth/login', {
    body: { email: accounts[key].email, password: PASSWORD },
  });
  assert.equal(status, 200, `login ${key}: ${JSON.stringify(data)}`);
  tokens[key] = data.token;
  return data.token;
}

const FULL_CONSENT = { personal: true, unique_id: true, disadvantage: true };

describe('UX batch 2026-11-27', { timeout: 120000 }, () => {
  before(async () => {
    await applyPendingMigrations();
    const prefix = SCHOOL_CODE_LIKE.replace('%', '');
    for (const k of ['A', 'B']) {
      const r = await query(
        `INSERT INTO schools (code, name, region, status) VALUES ($1, $2, '전북', 'active') RETURNING *`,
        [`${prefix}${k}`, `UXB학교${k}-${stamp}`]
      );
      schools[k] = r.rows[0];
    }
    await upsertUser('sys', { user_type: 'admin', school_id: null, role: 'system_admin' });
    await upsertUser('saA', { user_type: 'school_admin', school_id: schools.A.id, role: 'school_admin' });
    await upsertUser('saB', { user_type: 'school_admin', school_id: schools.B.id, role: 'school_admin' });
    await upsertUser('tA', { user_type: 'teacher', school_id: schools.A.id, role: 'teacher' });
    await upsertUser('tA2', { user_type: 'teacher', school_id: schools.A.id, role: 'teacher' });
    await upsertUser('gB', { user_type: 'graduate', school_id: schools.B.id, role: 'graduate' });

    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    for (const k of ['sys', 'saA', 'saB', 'tA', 'tA2', 'gB']) await login(k);
  });

  after(async () => {
    if (server) await new Promise((r) => server.close(r));
    try {
      const ids = `SELECT id FROM users WHERE email LIKE $1`;
      await query(`DELETE FROM education_program_applications WHERE user_id IN (${ids})`, [EMAIL_LIKE]);
      await query(`DELETE FROM education_programs WHERE created_by IN (${ids})`, [EMAIL_LIKE]);
      await query(`DELETE FROM audit_logs WHERE actor_id IN (${ids})`, [EMAIL_LIKE]);
      await query(
        `UPDATE schools SET primary_admin_user_id = NULL, status = 'inactive' WHERE code LIKE $1`,
        [SCHOOL_CODE_LIKE]
      );
      await query(`DELETE FROM user_roles WHERE user_id IN (${ids})`, [EMAIL_LIKE]);
      await query(`DELETE FROM company_profiles WHERE user_id IN (${ids})`, [EMAIL_LIKE]);
      await query(`UPDATE users SET is_active = false WHERE email LIKE $1`, [EMAIL_LIKE]);
    } catch (err) {
      console.warn('UXB cleanup skipped:', err.message);
    }
  });

  // ── 학교 등록: 주 담당자 선택 ─────────────────────────────
  test('schools: create without primary_admin → 201, admin null', async () => {
    const { status, data } = await jsonRequest('POST', '/api/schools', {
      token: tokens.sys,
      body: { name: `UXB무담당-${stamp}`, code: `${SCHOOL_CODE_LIKE.replace('%', '')}N` },
    });
    assert.equal(status, 201, JSON.stringify(data));
    assert.equal(data.school.primary_admin_user_id, null);
    assert.equal(data.primary_admin, null);
  });

  test('schools: partial primary_admin (email only) → 400, no school row', async () => {
    const name = `UXB부분-${stamp}`;
    const { status } = await jsonRequest('POST', '/api/schools', {
      token: tokens.sys,
      body: { name, code: `${SCHOOL_CODE_LIKE.replace('%', '')}P`, primary_admin: { email: `uxb.partial.${stamp}@jjob.test` } },
    });
    assert.equal(status, 400);
    const rows = await query('SELECT id FROM schools WHERE name = $1', [name]);
    assert.equal(rows.rows.length, 0);
  });

  test('schools: full primary_admin → 201 with admin linked', async () => {
    const { status, data } = await jsonRequest('POST', '/api/schools', {
      token: tokens.sys,
      body: {
        name: `UXB담당-${stamp}`,
        code: `${SCHOOL_CODE_LIKE.replace('%', '')}F`,
        primary_admin: { email: `uxb.pa.${stamp}@jjob.test`, name: 'UXB담당자', password: 'password123' },
      },
    });
    assert.equal(status, 201, JSON.stringify(data));
    assert.ok(data.school.primary_admin_user_id);
    assert.equal(data.primary_admin.email, `uxb.pa.${stamp}@jjob.test`);
  });

  test('schools: school_admin cannot create school → 403', async () => {
    const { status } = await jsonRequest('POST', '/api/schools', {
      token: tokens.saA,
      body: { name: `UXB금지-${stamp}` },
    });
    assert.equal(status, 403);
  });

  // ── 졸업생 가입 동의 ───────────────────────────────────
  const gradBody = (key, extra = {}) => ({
    email: `uxb.${key.toLowerCase()}.${stamp}@jjob.test`,
    password: PASSWORD,
    name: '동의테스트',
    user_type: 'graduate',
    school_id: schools.A.id,
    graduation_year: 2026,
    phone: '01012345678',
    ...extra,
  });

  test('register graduate without consent → 400', async () => {
    const { status, data } = await jsonRequest('POST', '/api/auth/register', { body: gradBody('noc') });
    assert.equal(status, 400, JSON.stringify(data));
  });

  test('register graduate with one item false → 400', async () => {
    const { status } = await jsonRequest('POST', '/api/auth/register', {
      body: gradBody('partc', {
        privacy_consent: true,
        privacy_consent_items: { personal: true, unique_id: false, disadvantage: true },
      }),
    });
    assert.equal(status, 400);
  });

  test('register graduate without graduation_year → 400', async () => {
    const { status } = await jsonRequest('POST', '/api/auth/register', {
      body: gradBody('nogy', { graduation_year: '', privacy_consent: true, privacy_consent_items: FULL_CONSENT }),
    });
    assert.equal(status, 400);
  });

  test('register graduate with full consent → 201 and consent stored', async () => {
    const { status, data } = await jsonRequest('POST', '/api/auth/register', {
      body: gradBody('gA', {
        name: '<b>졸업A</b>',
        privacy_consent: true,
        privacy_consent_items: FULL_CONSENT,
        privacy_consent_name: '<b>졸업A</b>',
      }),
    });
    assert.equal(status, 201, JSON.stringify(data));
    accounts.gA = { ...data.user, email: `uxb.ga.${stamp}@jjob.test` };
    const row = await query(
      `SELECT privacy_consent_at, privacy_consent_version, privacy_consent_items, privacy_consent_name, graduation_year
       FROM users WHERE id = $1`,
      [data.user.id]
    );
    const u = row.rows[0];
    assert.ok(u.privacy_consent_at, 'consent timestamp');
    assert.equal(u.privacy_consent_version, 'kosaf-2026');
    assert.deepEqual(u.privacy_consent_items, FULL_CONSENT);
    assert.equal(u.privacy_consent_name, '<b>졸업A</b>');
    assert.equal(Number(u.graduation_year), 2026);
    await login('gA');
  });

  test('register teacher without consent → 201 (consent only for graduates)', async () => {
    const { status, data } = await jsonRequest('POST', '/api/auth/register', {
      body: {
        email: `uxb.tnew.${stamp}@jjob.test`,
        password: PASSWORD,
        name: '교사가입',
        user_type: 'teacher',
        school_id: schools.A.id,
        phone: '01022223333',
      },
    });
    assert.equal(status, 201, JSON.stringify(data));
  });

  test('register admin type publicly → 400/403', async () => {
    const { status } = await jsonRequest('POST', '/api/auth/register', {
      body: { email: `uxb.adm.${stamp}@jjob.test`, password: PASSWORD, name: '관리자', user_type: 'admin' },
    });
    assert.ok(status === 400 || status === 403, `got ${status}`);
  });

  // ── 기업 가입 ──────────────────────────────────────────
  test('register company stores biz_no (digits), industry, size; pending', async () => {
    const { status, data } = await jsonRequest('POST', '/api/auth/register', {
      body: {
        email: `uxb.co.${stamp}@jjob.test`,
        password: PASSWORD,
        name: '채용담당',
        user_type: 'company',
        school_id: schools.A.id,
        company_name: 'UXB기업',
        biz_no: '123-45-67890',
        industry: 'IT/소프트웨어',
        company_size: '11-50',
        phone: '01099998888',
      },
    });
    assert.equal(status, 201, JSON.stringify(data));
    const cp = data.company_profile;
    assert.equal(cp.biz_no, '1234567890');
    assert.equal(cp.industry, 'IT/소프트웨어');
    assert.equal(cp.company_size, '11-50');
    assert.equal(cp.approval_status, 'pending');
    accounts.co = { ...data.user, email: `uxb.co.${stamp}@jjob.test` };
    await login('co');
  });

  test('register company without school → 400', async () => {
    const { status } = await jsonRequest('POST', '/api/auth/register', {
      body: {
        email: `uxb.co2.${stamp}@jjob.test`, password: PASSWORD, name: '채용담당',
        user_type: 'company', company_name: 'X', phone: '01011112222',
      },
    });
    assert.equal(status, 400);
  });

  // ── 동의서 조회 (관리자 출력) ──────────────────────────
  test('privacy-consent: same-school admin → 200 with consent fields', async () => {
    const { status, data } = await jsonRequest('GET', `/api/users/${accounts.gA.id}/privacy-consent`, { token: tokens.saA });
    assert.equal(status, 200, JSON.stringify(data));
    assert.ok(data.user.privacy_consent_at);
    assert.deepEqual(data.user.privacy_consent_items, FULL_CONSENT);
    assert.equal(data.user.privacy_consent_version, 'kosaf-2026');
    assert.equal(data.user.password_hash, undefined);
  });

  test('privacy-consent: system admin → 200', async () => {
    const { status } = await jsonRequest('GET', `/api/users/${accounts.gA.id}/privacy-consent`, { token: tokens.sys });
    assert.equal(status, 200);
  });

  test('privacy-consent: other-school admin → 403', async () => {
    const { status } = await jsonRequest('GET', `/api/users/${accounts.gA.id}/privacy-consent`, { token: tokens.saB });
    assert.equal(status, 403);
  });

  test('privacy-consent: teacher / graduate / company → 403', async () => {
    for (const k of ['tA', 'gB', 'co', 'gA']) {
      const { status } = await jsonRequest('GET', `/api/users/${accounts.gA.id}/privacy-consent`, { token: tokens[k] });
      assert.equal(status, 403, `${k} should be 403, got ${status}`);
    }
  });

  test('privacy-consent: no token → 401; missing user → 404', async () => {
    const a = await jsonRequest('GET', `/api/users/${accounts.gA.id}/privacy-consent`);
    assert.equal(a.status, 401);
    const b = await jsonRequest('GET', '/api/users/99999999/privacy-consent', { token: tokens.sys });
    assert.equal(b.status, 404);
  });

  // ── 교육프로그램 신청 ─────────────────────────────────
  test('edu: teacher A creates program (school A)', async () => {
    const { status, data } = await jsonRequest('POST', '/api/education-programs', {
      token: tokens.tA,
      body: { title: `UXB교육-${stamp}`, description: 'x' },
    });
    assert.equal(status, 201, JSON.stringify(data));
    assert.equal(data.program.school_id, schools.A.id);
    state.progId = data.program.id;
  });

  test('edu: graduate A applies → 201; duplicate → 409', async () => {
    const first = await jsonRequest('POST', `/api/education-programs/${state.progId}/apply`, {
      token: tokens.gA,
      body: { applicant_name: '졸업A', applicant_phone: '01012345678' },
    });
    assert.equal(first.status, 201, JSON.stringify(first.data));
    assert.equal(first.data.application.status, 'pending');
    state.appId = first.data.application.id;
    const dup = await jsonRequest('POST', `/api/education-programs/${state.progId}/apply`, {
      token: tokens.gA,
      body: { applicant_name: '졸업A', applicant_phone: '01012345678' },
    });
    assert.equal(dup.status, 409);
  });

  test('edu: other-school graduate apply → 403; company/teacher apply → 403', async () => {
    const b = await jsonRequest('POST', `/api/education-programs/${state.progId}/apply`, {
      token: tokens.gB, body: { applicant_name: 'B', applicant_phone: '010' },
    });
    assert.equal(b.status, 403);
    for (const k of ['co', 'tA2']) {
      const r = await jsonRequest('POST', `/api/education-programs/${state.progId}/apply`, {
        token: tokens[k], body: { applicant_name: 'X', applicant_phone: '010' },
      });
      assert.equal(r.status, 403, `${k} got ${r.status}`);
    }
  });

  test('edu: apply to missing program → 404', async () => {
    const r = await jsonRequest('POST', '/api/education-programs/99999999/apply', {
      token: tokens.gA, body: { applicant_name: 'A', applicant_phone: '010' },
    });
    assert.equal(r.status, 404);
  });

  test('edu: my-applications lists own application', async () => {
    const { status, data } = await jsonRequest('GET', '/api/education-programs/my-applications', { token: tokens.gA });
    assert.equal(status, 200);
    assert.ok(data.applications.some((a) => a.id === state.appId));
    const other = await jsonRequest('GET', '/api/education-programs/my-applications', { token: tokens.gB });
    assert.ok(!other.data.applications.some((a) => a.id === state.appId));
  });

  test('edu applicants: uploader teacher, same-school admin, system admin → 200', async () => {
    for (const k of ['tA', 'saA', 'sys']) {
      const { status, data } = await jsonRequest('GET', `/api/education-programs/${state.progId}/applications`, { token: tokens[k] });
      assert.equal(status, 200, `${k}: ${JSON.stringify(data)}`);
      assert.equal(data.applications.length, 1);
      assert.equal(data.applications[0].applicant_name, '졸업A');
    }
  });

  test('edu applicants: other teacher same school / other-school admin / graduate / company → 403', async () => {
    for (const k of ['tA2', 'saB', 'gA', 'co']) {
      const { status } = await jsonRequest('GET', `/api/education-programs/${state.progId}/applications`, { token: tokens[k] });
      assert.equal(status, 403, `${k} got ${status}`);
    }
  });

  test('edu applicant status: uploader → 200; other teacher → 403; bad status → 400', async () => {
    const ok = await jsonRequest('PATCH', `/api/education-programs/applications/${state.appId}`, {
      token: tokens.tA, body: { status: 'approved' },
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.equal(ok.data.application.status, 'approved');
    const no = await jsonRequest('PATCH', `/api/education-programs/applications/${state.appId}`, {
      token: tokens.tA2, body: { status: 'rejected' },
    });
    assert.equal(no.status, 403);
    const bad = await jsonRequest('PATCH', `/api/education-programs/applications/${state.appId}`, {
      token: tokens.tA, body: { status: 'hacked' },
    });
    assert.equal(bad.status, 400);
  });
});
