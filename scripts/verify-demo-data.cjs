#!/usr/bin/env node
/**
 * Persona demo-data smoke: login each DX account and GET key endpoints (expect 200).
 * Asserts [DEMO] seeded rows are visible where applicable.
 *
 * Usage:
 *   BASE_URL=http://127.0.0.1:5050 node scripts/verify-demo-data.cjs
 *   API_BASE=http://127.0.0.1:5050/api node scripts/verify-demo-data.cjs
 *
 * Exit 0 on all pass; 1 on any fail. Writes JSON summary to stdout end.
 */
'use strict';

const PASSWORD = process.env.DEMO_PASSWORD || 'password123';
const rawBase = (process.env.API_BASE || process.env.BASE_URL || 'http://127.0.0.1:8090').replace(/\/$/, '');
const API = rawBase.endsWith('/api') ? rawBase : `${rawBase}/api`;

const PERSONAS = [
  {
    email: 'student@jjob.com',
    role: 'student',
    gets: [
      ['/auth/me', (d) => d.user || d],
      ['/resumes', (d) => d.resumes],
      ['/jobs', (d) => d.jobs],
      ['/jobs/my/applications', (d) => d.applications || d],
      ['/jobs/scraps/me', (d) => d.scraps || d.jobs || d],
      ['/posts', (d) => d.posts],
      ['/posts/scraps/me', (d) => d.scraps || d.posts || d],
      ['/recommendations/me', (d) => d],
      ['/field-trips', (d) => d.trips || d.field_trips || d],
      ['/announcements/job-fair', (d) => d.announcements || d],
    ],
    asserts: [
      async (token, ctx) => {
        const resumes = ctx['/resumes']?.resumes || ctx['/resumes'] || [];
        const demo = (Array.isArray(resumes) ? resumes : []).filter((r) => String(r.title || '').includes('[DEMO]'));
        if (demo.length < 1) throw new Error('student: expected ≥1 [DEMO] resume');
        const primary = (Array.isArray(resumes) ? resumes : []).find((r) => r.is_primary);
        if (!primary || !String(primary.title || '').includes('[DEMO]')) {
          throw new Error('student: primary resume should be [DEMO]');
        }
      },
      async (token, ctx) => {
        const apps = ctx['/jobs/my/applications']?.applications
          || ctx['/jobs/my/applications']
          || [];
        const list = Array.isArray(apps) ? apps : [];
        if (list.length < 1) throw new Error('student: expected ≥1 job application');
      },
    ],
  },
  {
    email: 'graduate@jjob.com',
    role: 'graduate',
    gets: [
      ['/auth/me'],
      ['/resumes'],
      ['/posts'],
      ['/jobs'],
      ['/jobs/scraps/me'],
      ['/posts/scraps/me'],
      ['/recommendations/associated'],
    ],
    asserts: [
      async (_t, ctx) => {
        const resumes = ctx['/resumes']?.resumes || [];
        if (!resumes.some((r) => String(r.title || '').includes('[DEMO]'))) {
          throw new Error('graduate: expected [DEMO] resume');
        }
      },
    ],
  },
  {
    email: 'teacher@jjob.com',
    role: 'teacher',
    gets: [
      ['/auth/me'],
      ['/field-trips'],
      ['/posts'],
      ['/counseling-journals'],
      ['/announcements/industry-visit'],
    ],
    asserts: [
      async (_t, ctx) => {
        const trips = ctx['/field-trips']?.trips
          || ctx['/field-trips']?.field_trips
          || ctx['/field-trips']
          || [];
        const list = Array.isArray(trips) ? trips : [];
        if (!list.some((t) => String(t.title || '').includes('[DEMO]'))) {
          throw new Error('teacher: expected [DEMO] field trip');
        }
      },
    ],
  },
  {
    email: 'company@jjob.com',
    role: 'company',
    gets: [
      ['/auth/me'],
      ['/jobs'],
      ['/users/company-profile'],
    ],
    asserts: [
      async (_t, ctx) => {
        const jobs = ctx['/jobs']?.jobs || [];
        if (!jobs.some((j) => String(j.title || '').includes('[DEMO]'))) {
          throw new Error('company: expected [DEMO] job posting visible');
        }
        const me = ctx['/auth/me']?.user || ctx['/auth/me'] || {};
        // company profile approval may be nested
        void me;
      },
      async (token) => {
        // Find demo job and GET applicants
        const res = await fetchJson('GET', '/jobs', token);
        const jobs = res.data.jobs || [];
        const demo = jobs.find((j) => String(j.title || '').includes('[DEMO] 전주 스마트팩토리'));
        if (!demo) throw new Error('company: demo job not found for applicants check');
        const apps = await fetchJson('GET', `/jobs/${demo.id}/applicants`, token);
        if (apps.status !== 200) throw new Error(`company applicants ${apps.status}`);
      },
    ],
  },
  {
    email: 'admin@jjob.com',
    role: 'admin',
    gets: [
      ['/auth/me'],
      ['/schools'],
      ['/jobs'],
      ['/posts'],
      ['/announcements/job-fair'],
      ['/field-trips'],
      ['/worknet/status'],
    ],
    asserts: [
      async (_t, ctx) => {
        const me = ctx['/auth/me']?.user || ctx['/auth/me'] || {};
        const school = me.school || ctx['/auth/me']?.school;
        // Soft: if school present, prefer branding fields
        if (school && school.logo_file_id == null && school.primary_admin_user_id == null) {
          // still pass if schools list has JJTH branding
        }
        const schools = ctx['/schools']?.schools || ctx['/schools'] || [];
        const list = Array.isArray(schools) ? schools : [];
        const jjth = list.find((s) => s.code === 'JJTH' || /전주공업/.test(s.name || ''));
        if (!jjth) throw new Error('admin: JJTH school missing from GET /schools');
        if (jjth.logo_file_id == null) throw new Error('admin: JJTH logo_file_id null');
        if (jjth.primary_admin_user_id == null) throw new Error('admin: JJTH primary_admin_user_id null');
      },
    ],
  },
];

async function fetchJson(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { status: res.status, data };
}

async function login(email) {
  const { status, data } = await fetchJson('POST', '/auth/login', null, {
    email,
    password: PASSWORD,
  });
  if (status !== 200 || !data.token) {
    throw new Error(`login ${email} → ${status} ${JSON.stringify(data).slice(0, 180)}`);
  }
  return data.token;
}

async function runPersona(p) {
  const results = [];
  const token = await login(p.email);
  results.push({ step: 'login', ok: true });
  const ctx = {};
  for (const [path] of p.gets) {
    const { status, data } = await fetchJson('GET', path, token);
    const ok = status === 200;
    results.push({ step: `GET ${path}`, status, ok });
    if (!ok) throw new Error(`${p.email} GET ${path} → ${status}`);
    ctx[path] = data;
  }
  for (const assertFn of p.asserts || []) {
    await assertFn(token, ctx);
    results.push({ step: 'assert', ok: true });
  }
  return results;
}

async function main() {
  console.log(`API=${API}`);
  // Health (optional)
  try {
    const h = await fetch(`${API}/health`);
    console.log(`health ${h.status}`);
  } catch (e) {
    console.error(`Cannot reach ${API}: ${e.message}`);
    process.exit(1);
  }

  const matrix = [];
  let failed = 0;
  for (const p of PERSONAS) {
    try {
      const steps = await runPersona(p);
      matrix.push({ persona: p.role, email: p.email, pass: true, steps });
      console.log(`PASS ${p.role} (${p.email})`);
    } catch (e) {
      failed += 1;
      matrix.push({ persona: p.role, email: p.email, pass: false, error: String(e.message || e) });
      console.error(`FAIL ${p.role}: ${e.message || e}`);
    }
  }

  const summary = {
    api: API,
    passed: matrix.filter((m) => m.pass).length,
    failed,
    total: matrix.length,
    matrix,
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
