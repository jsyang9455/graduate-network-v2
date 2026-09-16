'use strict';

/**
 * School tenant branding + primary admin (REQ-IAM-001/003/008/009, REQ-PLT-004)
 * TC from docs/qa/school-tenant-branding-work-order.md
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'stb-test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '1d';
process.env.STORAGE_LOCAL_DIR = require('path').join(__dirname, '../../tmp-test-uploads-stb');

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { query, pool } = require('../config/database');
const { applyPendingMigrations } = require('../scripts/apply-migrations');
const app = require('../server');

let server;
let baseUrl;
let schoolA;
const accounts = {};
const PASSWORD = 'password123';
const stamp = Date.now();

async function ensureUsersTable() {
  const check = await query(`SELECT to_regclass('public.users') AS t`);
  if (!check.rows[0].t) {
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

async function login(email) {
  const { status, data } = await jsonRequest('POST', '/api/auth/login', {
    body: { email, password: PASSWORD },
  });
  assert.equal(status, 200, `login failed for ${email}: ${JSON.stringify(data)}`);
  return data.token;
}

describe('School tenant branding', { timeout: 120000 }, () => {
  before(async () => {
    await ensureUsersTable();
    await applyPendingMigrations();

    const a = await query(`SELECT * FROM schools WHERE name = '전주공업고등학교' LIMIT 1`);
    if (!a.rows.length) throw new Error('Default school missing');
    schoolA = a.rows[0];

    accounts.sys = await upsertUser({
      email: `stb.sys.${stamp}@jjob.test`,
      name: 'STB시스템',
      user_type: 'admin',
      school_id: null,
    });
    accounts.schoolAdmin = await upsertUser({
      email: `stb.sa.${stamp}@jjob.test`,
      name: 'STB학교관리',
      user_type: 'school_admin',
      school_id: schoolA.id,
    });
    accounts.student = await upsertUser({
      email: `stb.stu.${stamp}@jjob.test`,
      name: 'STB학생',
      user_type: 'student',
      school_id: schoolA.id,
    });

    // Ensure role rows exist for permissions
    for (const [u, code] of [
      [accounts.sys, 'system_admin'],
      [accounts.schoolAdmin, 'school_admin'],
      [accounts.student, 'student'],
    ]) {
      const role = await query(`SELECT id FROM roles WHERE code = $1`, [code]);
      if (role.rows.length) {
        await query(
          `INSERT INTO user_roles (user_id, role_id, school_id)
           SELECT $1, $2, $3
           WHERE NOT EXISTS (
             SELECT 1 FROM user_roles WHERE user_id = $1 AND role_id = $2
               AND school_id IS NOT DISTINCT FROM $3
           )`,
          [u.id, role.rows[0].id, code === 'system_admin' ? null : schoolA.id]
        );
      }
    }

    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((r) => server.close(r));
    try {
      await query(
        `DELETE FROM audit_logs WHERE actor_id IN (
           SELECT id FROM users WHERE email LIKE $1
         ) OR school_id IN (
           SELECT id FROM schools WHERE code LIKE 'STB%'
         )`,
        [`stb.%${stamp}@jjob.test`]
      );
      await query(
        `DELETE FROM user_roles WHERE user_id IN (
           SELECT id FROM users WHERE email LIKE $1
         ) OR school_id IN (
           SELECT id FROM schools WHERE code LIKE 'STB%'
         )`,
        [`stb.%${stamp}@jjob.test`]
      );
      await query(
        `UPDATE schools SET primary_admin_user_id = NULL, logo_file_id = NULL
         WHERE code LIKE 'STB%' OR primary_admin_user_id IN (
           SELECT id FROM users WHERE email LIKE $1
         )`,
        [`stb.%${stamp}@jjob.test`]
      );
      await query(`UPDATE users SET is_active = false WHERE email LIKE $1`, [
        `stb.%${stamp}@jjob.test`,
      ]);
    } catch (err) {
      console.warn('STB cleanup skipped:', err.message);
    }
  });

  test('TC-01 POST /schools without primary_admin → 400', async () => {
    const token = await login(accounts.sys.email);
    const { status, data } = await jsonRequest('POST', '/api/schools', {
      token,
      body: { name: `STB무담당-${stamp}` },
    });
    assert.equal(status, 400);
    assert.equal(data.code || data.error?.code, 'VALIDATION');
  });

  test('TC-02/03 create with primary_admin; duplicate email 409; login + me.school', async () => {
    const token = await login(accounts.sys.email);
    const code = `STB${String(stamp).slice(-6)}`;
    const adminEmail = `stb.primary.${stamp}@jjob.test`;

    const created = await jsonRequest('POST', '/api/schools', {
      token,
      body: {
        name: `STB테스트고-${stamp}`,
        code,
        region: '전북',
        primary_admin: {
          email: adminEmail,
          name: 'STB주담당',
          password: PASSWORD,
        },
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.ok(created.data.school?.id);
    assert.equal(created.data.school.primary_admin_user_id, created.data.primary_admin.id);
    assert.equal(created.data.primary_admin.user_type, 'school_admin');

    const dup = await jsonRequest('POST', '/api/schools', {
      token,
      body: {
        name: `STB테스트고2-${stamp}`,
        code: `${code}B`,
        primary_admin: {
          email: adminEmail,
          name: '중복',
          password: PASSWORD,
        },
      },
    });
    assert.equal(dup.status, 409);

    const adminToken = await login(adminEmail);
    const me = await jsonRequest('GET', '/api/auth/me', { token: adminToken });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.school_id, created.data.school.id);
    assert.equal(me.data.user.school?.name, `STB테스트고-${stamp}`);
    assert.equal(me.data.user.user_type, 'school_admin');
  });

  test('TC-04 logo upload + public GET', async () => {
    const token = await login(accounts.sys.email);
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    const form = new FormData();
    form.append('file', new Blob([png], { type: 'image/png' }), 'logo.png');

    const up = await fetch(`${baseUrl}/api/schools/${schoolA.id}/logo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const upData = await up.json();
    assert.equal(up.status, 201, JSON.stringify(upData));
    assert.ok(upData.school?.logo_file_id);
    assert.ok(upData.school?.logo_url);

    const getLogo = await fetch(`${baseUrl}/api/schools/${schoolA.id}/logo`);
    assert.equal(getLogo.status, 200);
    assert.match(getLogo.headers.get('content-type') || '', /image\//);
  });

  test('TC-05 student me.school matches own school', async () => {
    const token = await login(accounts.student.email);
    const me = await jsonRequest('GET', '/api/auth/me', { token });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.school?.id, schoolA.id);
    assert.equal(me.data.user.school?.name, schoolA.name);
    if (me.data.user.school?.logo_file_id) {
      assert.ok(String(me.data.user.school.logo_url).includes(`/api/schools/${schoolA.id}/logo`));
    }
  });

  test('TC-06/07 school_admin lacks schools manage; system_admin has it', async () => {
    const saToken = await login(accounts.schoolAdmin.email);
    const saPerm = await jsonRequest('GET', '/api/me/permissions', { token: saToken });
    assert.equal(saPerm.status, 200);
    const saSchools = (saPerm.data.menus || []).find((m) => m.code === 'schools');
    assert.ok(saSchools);
    assert.ok(saSchools.actions.includes('write'));
    assert.equal(saSchools.actions.includes('manage'), false);

    const sysToken = await login(accounts.sys.email);
    const sysPerm = await jsonRequest('GET', '/api/me/permissions', { token: sysToken });
    assert.equal(sysPerm.status, 200);
    const sysSchools = (sysPerm.data.menus || []).find((m) => m.code === 'schools');
    assert.ok(sysSchools?.actions.includes('manage'));
  });
});
