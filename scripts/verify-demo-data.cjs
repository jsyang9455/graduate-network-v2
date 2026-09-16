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
      ['/announcements/certification', (d) => d.announcements || d],
      ['/education-programs', (d) => d.programs || d],
      ['/counseling', (d) => d.sessions || d],
    ],
    asserts: [
      async (_t, ctx) => {
        const me = ctx['/auth/me']?.user || ctx['/auth/me'] || {};
        if (!me.school_id) throw new Error('student: school_id missing (expected JJTH)');
      },
      async (_t, ctx) => {
        const resumes = ctx['/resumes']?.resumes || ctx['/resumes'] || [];
        const demo = (Array.isArray(resumes) ? resumes : []).filter((r) => String(r.title || '').includes('[DEMO]'));
        if (demo.length < 1) throw new Error('student: expected ≥1 [DEMO] resume');
        const primary = (Array.isArray(resumes) ? resumes : []).find((r) => r.is_primary);
        if (!primary || !String(primary.title || '').includes('[DEMO]')) {
          throw new Error('student: primary resume should be [DEMO]');
        }
      },
      async (_t, ctx) => {
        const apps = ctx['/jobs/my/applications']?.applications
          || ctx['/jobs/my/applications']
          || [];
        const list = Array.isArray(apps) ? apps : [];
        if (list.length < 1) throw new Error('student: expected ≥1 job application');
      },
      async (_t, ctx) => {
        const anns = ctx['/announcements/job-fair']?.announcements || ctx['/announcements/job-fair'] || [];
        const demo = (Array.isArray(anns) ? anns : []).filter((a) => String(a.title || '').includes('[DEMO]'));
        if (demo.length < 2) throw new Error(`student: expected ≥2 [DEMO] job-fair (got ${demo.length})`);
      },
      async (_t, ctx) => {
        const sessions = ctx['/counseling']?.sessions || ctx['/counseling'] || [];
        const list = Array.isArray(sessions) ? sessions : [];
        const demo = list.filter((s) => String(s.topic || '').includes('[DEMO]'));
        if (demo.length < 2) throw new Error(`student: expected ≥2 [DEMO] counseling sessions (got ${demo.length})`);
      },
      async (_t, ctx) => {
        const programs = ctx['/education-programs']?.programs || ctx['/education-programs'] || [];
        const list = Array.isArray(programs) ? programs : [];
        if (!list.some((p) => String(p.title || '').includes('[DEMO]'))) {
          throw new Error('student: expected ≥1 [DEMO] education program');
        }
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
        const me = ctx['/auth/me']?.user || ctx['/auth/me'] || {};
        if (!me.school_id) throw new Error('graduate: school_id missing');
      },
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
      ['/counseling'],
      ['/announcements/industry-visit'],
      ['/announcements/certification'],
      ['/education-programs'],
    ],
    asserts: [
      async (_t, ctx) => {
        const me = ctx['/auth/me']?.user || ctx['/auth/me'] || {};
        if (!me.school_id) throw new Error('teacher: school_id missing (expected JJTH)');
        if (!me.is_counselor) throw new Error('teacher: is_counselor should be true');
      },
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
      async (_t, ctx) => {
        const journals = ctx['/counseling-journals']?.journals
          || ctx['/counseling-journals']
          || [];
        const list = Array.isArray(journals) ? journals : [];
        const demo = list.filter((j) => String(j.title || '').includes('[DEMO]'));
        if (demo.length < 3) throw new Error(`teacher: expected ≥3 [DEMO] journals (got ${demo.length})`);
      },
      async (_t, ctx) => {
        const sessions = ctx['/counseling']?.sessions || ctx['/counseling'] || [];
        const list = Array.isArray(sessions) ? sessions : [];
        const demo = list.filter((s) => String(s.topic || '').includes('[DEMO]'));
        if (demo.length < 3) throw new Error(`teacher: expected ≥3 [DEMO] counseling sessions (got ${demo.length})`);
      },
      async (_t, ctx) => {
        const visits = ctx['/announcements/industry-visit']?.announcements
          || ctx['/announcements/industry-visit']
          || [];
        const demo = (Array.isArray(visits) ? visits : []).filter((a) => String(a.title || '').includes('[DEMO]'));
        if (demo.length < 2) throw new Error(`teacher: expected ≥2 [DEMO] industry-visit (got ${demo.length})`);
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
        void me;
      },
      async (token) => {
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
      ['/announcements/industry-visit'],
      ['/announcements/certification'],
      ['/field-trips'],
      ['/education-programs'],
      ['/worknet/status'],
    ],
    asserts: [
      async (_t, ctx) => {
        const me = ctx['/auth/me']?.user || ctx['/auth/me'] || {};
        const school = me.school || ctx['/auth/me']?.school;
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
      async (_t, ctx) => {
        for (const path of [
          '/announcements/job-fair',
          '/announcements/industry-visit',
          '/announcements/certification',
        ]) {
          const anns = ctx[path]?.announcements || ctx[path] || [];
          const demo = (Array.isArray(anns) ? anns : []).filter((a) => String(a.title || '').includes('[DEMO]'));
          if (demo.length < 2) throw new Error(`admin: expected ≥2 [DEMO] on ${path} (got ${demo.length})`);
        }
      },
      async () => {
        // Public logo stream must return real image bytes (not metadata-only 404)
        const schoolsRes = await fetchJson('GET', '/schools', null);
        const list = schoolsRes.data.schools || schoolsRes.data || [];
        const jjth = (Array.isArray(list) ? list : []).find(
          (s) => s.code === 'JJTH' || /전주공업/.test(s.name || '')
        );
        if (!jjth?.id) throw new Error('admin: JJTH id missing for logo GET');
        const logoUrl = `${API}/schools/${jjth.id}/logo`;
        const res = await fetch(logoUrl);
        if (res.status !== 200) {
          throw new Error(`admin: GET /schools/${jjth.id}/logo → ${res.status}`);
        }
        const ctype = String(res.headers.get('content-type') || '');
        if (!/image\//i.test(ctype) && !/svg/i.test(ctype)) {
          throw new Error(`admin: logo content-type unexpected: ${ctype}`);
        }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 100) {
          throw new Error(`admin: logo body too small (${buf.length} B)`);
        }
        const head = buf.slice(0, 64).toString('utf8');
        if (!head.includes('<svg') && !head.includes('PNG') && buf[0] !== 0xff) {
          if (!/svg/i.test(ctype)) {
            throw new Error('admin: logo body does not look like an image');
          }
        }
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
