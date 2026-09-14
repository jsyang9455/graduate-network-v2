'use strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'wave1-test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '1d';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = require('path').join(__dirname, '../../tmp-test-uploads');

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { query } = require('../config/database');
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
  return { status: res.status, data, raw: text, headers: res.headers };
}

async function binaryRequest(method, path, { token, body, accept } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (accept) headers.Accept = accept;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf, headers: res.headers };
}

async function login(email) {
  const { status, data } = await jsonRequest('POST', '/api/auth/login', {
    body: { email, password: PASSWORD },
  });
  assert.equal(status, 200, `login failed for ${email}: ${JSON.stringify(data)}`);
  return data.token;
}

describe('Sprint 1 resumes and counseling documents', { timeout: 120000 }, () => {
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
      email: 'qa.s1.student.a@jjob.test', name: 'S1학생A', user_type: 'student', school_id: schoolA.id,
    });
    accounts.studentB = await upsertUser({
      email: 'qa.s1.student.b@jjob.test', name: 'S1학생B', user_type: 'student', school_id: schoolB.id,
    });
    accounts.teacherA = await upsertUser({
      email: 'qa.s1.teacher.a@jjob.test', name: 'S1교사A', user_type: 'teacher', school_id: schoolA.id,
    });
    accounts.teacherB = await upsertUser({
      email: 'qa.s1.teacher.b@jjob.test', name: 'S1교사B', user_type: 'teacher', school_id: schoolB.id,
    });
    accounts.company = await upsertUser({
      email: 'qa.s1.company@jjob.test', name: 'S1기업', user_type: 'company', school_id: schoolA.id,
    });

    await query(`DELETE FROM job_applications WHERE user_id = ANY($1::int[])`, [[
      accounts.studentA.id, accounts.studentB.id,
    ]]);
    await query(`DELETE FROM resumes WHERE user_id = ANY($1::int[])`, [[
      accounts.studentA.id, accounts.studentB.id,
    ]]);
    await query(`DELETE FROM counseling_journals WHERE teacher_id = ANY($1::int[])`, [[
      accounts.teacherA.id, accounts.teacherB.id,
    ]]);
    await query(`DELETE FROM jobs WHERE company_id = $1`, [accounts.company.id]);

    const job = await query(
      `INSERT INTO jobs (company_id, title, description, location, job_type, status, school_id)
       VALUES ($1, 'S1 테스트 공고', '설명', '전주', 'full-time', 'active', $2)
       RETURNING *`,
      [accounts.company.id, schoolA.id]
    );
    accounts.jobId = job.rows[0].id;

    const journal = await query(
      `INSERT INTO counseling_journals
         (teacher_id, teacher_name, student_id, student_name, counseling_date, type, title, content, action_taken, school_id)
       VALUES ($1, $2, $3, $4, CURRENT_DATE, '진학상담', '진학 상담', '내용입니다', '진학 자료 안내', $5)
       RETURNING id`,
      [accounts.teacherA.id, 'S1교사A', accounts.studentA.id, 'S1학생A', schoolA.id]
    );
    accounts.journalAId = journal.rows[0].id;

    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    // Shared pg pool is closed by the last integration file (wave1).
  });

  test('REQ-RSM-001/002 student CRUD + primary resume is school-scoped', async () => {
    const token = await login('qa.s1.student.a@jjob.test');
    const created = await jsonRequest('POST', '/api/resumes', {
      token,
      body: {
        title: '대표 이력서',
        summary: '안녕하세요. 전주공업고 학생입니다.',
        items: [
          { section: 'education', payload: { institution: '전주공업고등학교', name: '전자과', startDate: '2023-03' } },
          { section: 'skill', payload: { name: 'Python' } },
        ],
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.resume.is_primary, true);
    assert.equal(Number(created.data.resume.school_id), Number(schoolA.id));
    accounts.resumeAId = created.data.resume.id;
    assert.equal(created.data.resume.items.length, 2);

    const listed = await jsonRequest('GET', '/api/resumes', { token });
    assert.equal(listed.status, 200);
    assert.ok((listed.data.resumes || []).some((r) => Number(r.id) === Number(accounts.resumeAId)));

    const updated = await jsonRequest('PUT', `/api/resumes/${accounts.resumeAId}`, {
      token,
      body: {
        title: '업데이트 이력서',
        items: [
          { section: 'experience', payload: { company: '실습기업', position: '인턴', startDate: '2025-01', current: true } },
        ],
      },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.resume.title, '업데이트 이력서');
    assert.equal(updated.data.resume.items[0].section, 'experience');
  });

  test('REQ-IAM-009 student B cannot read student A resume (403)', async () => {
    const token = await login('qa.s1.student.b@jjob.test');
    const { status } = await jsonRequest('GET', `/api/resumes/${accounts.resumeAId}`, { token });
    assert.equal(status, 403);
  });

  test('REQ-RSM-003 preview returns html', async () => {
    const token = await login('qa.s1.student.a@jjob.test');
    const { status, data } = await jsonRequest('GET', `/api/resumes/${accounts.resumeAId}/preview`, { token });
    assert.equal(status, 200);
    assert.ok(typeof data.html === 'string' && data.html.includes('이력서'));
  });

  test('REQ-RSM-004 PDF smoke generates %PDF and stores file', async () => {
    const token = await login('qa.s1.student.a@jjob.test');
    const created = await jsonRequest('POST', `/api/resumes/${accounts.resumeAId}/pdf`, { token, body: {} });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.file.kind, 'resume_pdf');
    accounts.fileId = created.data.file.id;

    const bin = await binaryRequest('GET', `/api/files/${accounts.fileId}?download=1`, { token });
    assert.equal(bin.status, 200);
    assert.ok(bin.buf.slice(0, 4).toString() === '%PDF', `not a pdf: ${bin.buf.slice(0, 20)}`);
    assert.ok(bin.buf.length > 500);
  });

  test('REQ-JOB-005 apply accepts resume_id', async () => {
    const token = await login('qa.s1.student.a@jjob.test');
    const { status, data } = await jsonRequest('POST', `/api/jobs/${accounts.jobId}/apply`, {
      token,
      body: { resume_id: accounts.resumeAId, cover_letter: '지원합니다' },
    });
    assert.equal(status, 201, JSON.stringify(data));
    assert.equal(Number(data.application.resume_id), Number(accounts.resumeAId));
  });

  test('teacher A can read same-school resume; teacher B cannot', async () => {
    const tokenA = await login('qa.s1.teacher.a@jjob.test');
    const ok = await jsonRequest('GET', `/api/resumes/${accounts.resumeAId}`, { token: tokenA });
    assert.equal(ok.status, 200);
    const tokenB = await login('qa.s1.teacher.b@jjob.test');
    const denied = await jsonRequest('GET', `/api/resumes/${accounts.resumeAId}`, { token: tokenB });
    assert.equal(denied.status, 403);
  });

  test('REQ-CNS-004 counseling journal PDF and DOCX export', async () => {
    const token = await login('qa.s1.teacher.a@jjob.test');
    const pdf = await jsonRequest('POST', `/api/counseling-journals/${accounts.journalAId}/pdf`, {
      token,
      body: { kind: 'journal' },
    });
    assert.equal(pdf.status, 201, JSON.stringify(pdf.data));
    const pdfBin = await binaryRequest('GET', `/api/files/${pdf.data.file.id}`, { token });
    assert.equal(pdfBin.status, 200);
    assert.equal(pdfBin.buf.slice(0, 4).toString(), '%PDF');

    const docx = await jsonRequest('POST', `/api/counseling-journals/${accounts.journalAId}/docx`, {
      token,
      body: { kind: 'confirm' },
    });
    assert.equal(docx.status, 201, JSON.stringify(docx.data));
    const docxBin = await binaryRequest('GET', `/api/files/${docx.data.file.id}`, { token });
    assert.equal(docxBin.status, 200);
    assert.equal(docxBin.buf.slice(0, 2).toString(), 'PK');
  });

  test('REQ-CNS-005 stats and timeline are school-scoped', async () => {
    const tokenA = await login('qa.s1.teacher.a@jjob.test');
    const stats = await jsonRequest('GET', '/api/counseling-journals/stats', { token: tokenA });
    assert.equal(stats.status, 200);
    assert.ok(stats.data.stats.total >= 1);
    const timeline = await jsonRequest('GET', `/api/counseling-journals/timeline/${accounts.studentA.id}`, { token: tokenA });
    assert.equal(timeline.status, 200);
    assert.ok((timeline.data.journals || []).length >= 1);

    const tokenB = await login('qa.s1.teacher.b@jjob.test');
    const denied = await jsonRequest('GET', `/api/counseling-journals/timeline/${accounts.studentA.id}`, { token: tokenB });
    assert.equal(denied.status, 403);
  });

  test('cross-school counseling PDF is 403', async () => {
    const tokenB = await login('qa.s1.teacher.b@jjob.test');
    const { status } = await jsonRequest('POST', `/api/counseling-journals/${accounts.journalAId}/pdf`, { token: tokenB });
    assert.equal(status, 403);
  });
});
