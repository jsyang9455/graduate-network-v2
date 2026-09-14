'use strict';

/**
 * Lightweight persona smoke (Playwright 대안).
 * REQ-REC-004 / REQ-TRP-002: login → recommendation feed OR field-trips list.
 * Runs inside `npm --prefix backend test` (node:test). No browser install required.
 *
 * Optional browser smoke (puppeteer, root): `npm run test:e2e`
 * See docs/qa/e2e-persona-smoke.md
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'wave1-test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '1d';
process.env.DISABLE_CRON = '1';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = require('path').join(__dirname, '../../tmp-test-uploads-e2e');

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { query, pool } = require('../config/database');
const { applyPendingMigrations } = require('../scripts/apply-migrations');
const app = require('../server');

let server;
let baseUrl;
const PASSWORD = 'password123';
const EMAIL = 'qa.e2e.persona@jjob.test';

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

describe('Persona smoke: login → recommendations or field-trips', { timeout: 120000 }, () => {
  before(async () => {
    await ensureUsersTable();
    await applyPendingMigrations();

    const school = await query(`SELECT * FROM schools WHERE name = '전주공업고등학교' LIMIT 1`);
    if (!school.rows.length) throw new Error('Default school missing');
    const hash = await bcrypt.hash(PASSWORD, 10);
    const existing = await query('SELECT id FROM users WHERE email = $1', [EMAIL]);
    if (existing.rows.length) {
      await query(
        `UPDATE users SET password_hash = $1, school_id = $2, user_type = 'student', is_active = true WHERE email = $3`,
        [hash, school.rows[0].id, EMAIL]
      );
    } else {
      await query(
        `INSERT INTO users (email, password_hash, name, user_type, school_id, is_active)
         VALUES ($1, $2, 'E2E학생', 'student', $3, true)`,
        [EMAIL, hash, school.rows[0].id]
      );
    }

    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  test('login then GET /api/recommendations/me returns 200 with recommendations array', async () => {
    const login = await jsonRequest('POST', '/api/auth/login', {
      body: { email: EMAIL, password: PASSWORD },
    });
    assert.equal(login.status, 200, JSON.stringify(login.data));
    assert.ok(login.data.token);

    const feed = await jsonRequest('GET', '/api/recommendations/me', { token: login.data.token });
    assert.equal(feed.status, 200, JSON.stringify(feed.data));
    assert.ok(Array.isArray(feed.data.recommendations), 'recommendations must be an array');
  });

  test('same token can list field-trips (apply path available)', async () => {
    const login = await jsonRequest('POST', '/api/auth/login', {
      body: { email: EMAIL, password: PASSWORD },
    });
    assert.equal(login.status, 200);
    const trips = await jsonRequest('GET', '/api/field-trips', { token: login.data.token });
    assert.equal(trips.status, 200, JSON.stringify(trips.data));
    assert.ok(Array.isArray(trips.data.field_trips), 'field_trips must be an array');
  });
});
