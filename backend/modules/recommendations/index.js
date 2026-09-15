'use strict';

/**
 * Explainable job recommendations (REQ-REC-001/003/004/005).
 *
 * Scoring factors (documented for UI reasons[]):
 * - skill_overlap: token overlap between resume keywords and job keywords (0–0.55)
 * - location_match: resume/user region vs job.location (+0.15)
 * - deadline_boost: deadline within 7 days (+0.12)
 * - major_fit: department/major token appears in job text (+0.10)
 * - freshness: job created within 14 days (+0.08)
 *
 * Not a full TF-IDF stack; bag-of-words overlap is the P0 content match.
 */

const { query } = require('../../config/database');

const STOP = new Set([
  '및', '또는', '있는', '없는', '위한', '하는', '관련', '등', '및', 'the', 'and', 'or', 'for', 'with', 'a', 'an',
]);

function tokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s+#./-]/gu, ' ')
    .split(/[\s,;/|]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP.has(t));
}

function pushTokens(map, text, weight = 1) {
  for (const token of tokenize(text)) {
    map.set(token, (map.get(token) || 0) + weight);
  }
}

function extractResumeProfile(resume, items) {
  const tokens = new Map();
  pushTokens(tokens, resume.summary, 1.2);
  pushTokens(tokens, resume.title, 0.5);
  const basic = resume.basic_info || {};
  pushTokens(tokens, basic.desired_job || basic.job || basic.position, 1.5);
  pushTokens(tokens, basic.location || basic.region || basic.address, 1.0);
  pushTokens(tokens, basic.major || basic.department, 1.2);

  for (const item of items || []) {
    const p = item.payload || {};
    if (item.section === 'skill') {
      pushTokens(tokens, p.name || p.skill || p.title || JSON.stringify(p), 2.0);
    } else if (item.section === 'certificate') {
      pushTokens(tokens, p.name || p.title, 1.5);
    } else if (item.section === 'experience') {
      pushTokens(tokens, `${p.title || ''} ${p.company || ''} ${p.description || ''}`, 1.0);
    } else if (item.section === 'education') {
      pushTokens(tokens, `${p.school || ''} ${p.major || ''} ${p.degree || ''}`, 1.0);
    } else if (item.section === 'intro') {
      pushTokens(tokens, p.text || p.content || JSON.stringify(p), 0.8);
    }
  }

  return {
    tokens,
    locationHint: basic.location || basic.region || '',
    majorHint: basic.major || basic.department || '',
  };
}

function extractJobTokens(job) {
  const tokens = new Map();
  pushTokens(tokens, job.title, 2.0);
  pushTokens(tokens, job.description, 1.0);
  pushTokens(tokens, job.requirements, 1.5);
  pushTokens(tokens, job.location, 1.2);
  pushTokens(tokens, job.job_type, 0.5);
  pushTokens(tokens, job.experience_level, 0.5);
  return tokens;
}

function overlapScore(resumeTokens, jobTokens) {
  if (!resumeTokens.size || !jobTokens.size) return { score: 0, matched: [] };
  let dot = 0;
  let a2 = 0;
  let b2 = 0;
  const matched = [];
  for (const [, w] of resumeTokens) a2 += w * w;
  for (const [, w] of jobTokens) b2 += w * w;
  for (const [token, rw] of resumeTokens) {
    if (jobTokens.has(token)) {
      const jw = jobTokens.get(token);
      dot += rw * jw;
      matched.push(token);
    }
  }
  if (a2 === 0 || b2 === 0) return { score: 0, matched: [] };
  const cosine = dot / (Math.sqrt(a2) * Math.sqrt(b2));
  return { score: Math.min(0.55, cosine * 0.55), matched: matched.slice(0, 8) };
}

function scoreJob(profile, job, now = new Date()) {
  const jobTokens = extractJobTokens(job);
  const { score: skillScore, matched } = overlapScore(profile.tokens, jobTokens);
  const reasons = [];

  if (skillScore > 0.02 && matched.length) {
    reasons.push({
      code: 'skill_overlap',
      label: `스킬/키워드 일치: ${matched.slice(0, 4).join(', ')}`,
      weight: Number(skillScore.toFixed(3)),
    });
  }

  let total = skillScore;
  const loc = (job.location || '').toLowerCase();
  const hint = (profile.locationHint || '').toLowerCase();
  if (loc && hint && (loc.includes(hint) || hint.includes(loc.split(/\s/)[0]))) {
    total += 0.15;
    reasons.push({ code: 'location_match', label: `지역 적합: ${job.location}`, weight: 0.15 });
  }

  if (job.deadline) {
    const dl = new Date(job.deadline);
    const days = (dl - now) / (1000 * 60 * 60 * 24);
    if (days >= 0 && days <= 7) {
      total += 0.12;
      reasons.push({ code: 'deadline_boost', label: '마감 임박', weight: 0.12 });
    }
  }

  const major = (profile.majorHint || '').toLowerCase();
  const jobBlob = `${job.title || ''} ${job.description || ''} ${job.requirements || ''}`.toLowerCase();
  if (major && major.length >= 2 && jobBlob.includes(major)) {
    total += 0.1;
    reasons.push({ code: 'major_fit', label: `학과 적합: ${profile.majorHint}`, weight: 0.1 });
  }

  if (job.created_at) {
    const ageDays = (now - new Date(job.created_at)) / (1000 * 60 * 60 * 24);
    if (ageDays >= 0 && ageDays <= 14) {
      total += 0.08;
      reasons.push({ code: 'freshness', label: '신규 공고', weight: 0.08 });
    }
  }

  return {
    score: Number(Math.min(1, total).toFixed(4)),
    reasons,
  };
}

async function persistKeywords(table, idColumn, id, tokenMap) {
  await query(`DELETE FROM ${table} WHERE ${idColumn} = $1`, [id]);
  for (const [token, weight] of tokenMap) {
    await query(
      `INSERT INTO ${table} (${idColumn}, token, weight) VALUES ($1, $2, $3)
       ON CONFLICT (${idColumn}, token) DO UPDATE SET weight = EXCLUDED.weight`,
      [id, token.slice(0, 100), weight]
    );
  }
}

async function loadActiveJobsForSchool(schoolId) {
  if (schoolId == null) {
    const result = await query(
      `SELECT id, title, description, requirements, location, job_type, experience_level,
              deadline, school_id, created_at, status
       FROM jobs WHERE status = 'active'`
    );
    return result.rows;
  }
  const result = await query(
    `SELECT id, title, description, requirements, location, job_type, experience_level,
            deadline, school_id, created_at, status
     FROM jobs
     WHERE status = 'active' AND school_id = $1`,
    [schoolId]
  );
  return result.rows;
}

async function recomputeForUser(userId, { schoolId = null } = {}) {
  const userRes = await query('SELECT id, school_id FROM users WHERE id = $1', [userId]);
  if (!userRes.rows.length) return { userId, count: 0 };
  const user = userRes.rows[0];
  const scopedSchool = schoolId != null ? schoolId : user.school_id;

  const resumeRes = await query(
    `SELECT * FROM resumes
     WHERE user_id = $1 AND (is_primary = true OR status = 'published')
     ORDER BY is_primary DESC, updated_at DESC
     LIMIT 1`,
    [userId]
  );
  if (!resumeRes.rows.length) {
    await query('DELETE FROM job_recommendations WHERE user_id = $1', [userId]);
    return { userId, count: 0, skipped: 'no_resume' };
  }
  const resume = resumeRes.rows[0];
  const items = (await query(
    'SELECT section, payload FROM resume_items WHERE resume_id = $1',
    [resume.id]
  )).rows;

  const profile = extractResumeProfile(resume, items);
  await persistKeywords('resume_keywords', 'resume_id', resume.id, profile.tokens);

  const jobs = await loadActiveJobsForSchool(scopedSchool);
  const now = new Date();
  let count = 0;

  await query('DELETE FROM job_recommendations WHERE user_id = $1', [userId]);

  for (const job of jobs) {
    const jobTokens = extractJobTokens(job);
    await persistKeywords('job_keywords', 'job_id', job.id, jobTokens);
    const { score, reasons } = scoreJob(profile, job, now);
    if (score < 0.05 && reasons.length === 0) continue;
    await query(
      `INSERT INTO job_recommendations (user_id, job_id, school_id, score, reasons, computed_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, job_id) DO UPDATE
         SET score = EXCLUDED.score, reasons = EXCLUDED.reasons,
             school_id = EXCLUDED.school_id, computed_at = CURRENT_TIMESTAMP`,
      [userId, job.id, scopedSchool, score, JSON.stringify(reasons)]
    );
    count += 1;
  }

  return { userId, count };
}

async function recomputeSchool(schoolId) {
  const users = await query(
    `SELECT DISTINCT u.id
     FROM users u
     JOIN resumes r ON r.user_id = u.id
     WHERE u.school_id = $1 AND u.is_active = true
       AND u.user_type IN ('student', 'graduate')`,
    [schoolId]
  );
  const results = [];
  for (const row of users.rows) {
    results.push(await recomputeForUser(row.id, { schoolId }));
  }
  return { schoolId, users: results.length, results };
}

async function recomputeAllActiveSchools() {
  const schools = await query(`SELECT id FROM schools WHERE status = 'active'`);
  const out = [];
  for (const s of schools.rows) {
    out.push(await recomputeSchool(s.id));
  }
  return out;
}

/**
 * REQ-REC-002 — market-basket style association from applications + job scraps.
 * School-scoped; returns explainable reasons (also_applied / also_scraped).
 */
async function associatedForUser(userId, { limit = 10 } = {}) {
  const userRes = await query('SELECT id, school_id FROM users WHERE id = $1', [userId]);
  if (!userRes.rows.length) return { recommendations: [], seed_count: 0 };
  const schoolId = userRes.rows[0].school_id;

  const seedRes = await query(
    `SELECT job_id, 'apply' AS source FROM job_applications WHERE user_id = $1
     UNION
     SELECT job_id, 'scrap' AS source FROM job_scraps WHERE user_id = $1`,
    [userId]
  );
  const seedIds = [...new Set(seedRes.rows.map((r) => Number(r.job_id)))];
  if (!seedIds.length) {
    return { recommendations: [], seed_count: 0, message: 'no_seed_activity' };
  }

  const peerRes = await query(
    `WITH seed AS (SELECT UNNEST($1::int[]) AS job_id),
          peer_events AS (
            SELECT ja.user_id, ja.job_id, 'apply'::text AS source
            FROM job_applications ja
            JOIN users u ON u.id = ja.user_id
            WHERE ja.job_id IN (SELECT job_id FROM seed)
              AND ja.user_id <> $2
              AND ($3::int IS NULL OR u.school_id = $3)
            UNION ALL
            SELECT js.user_id, js.job_id, 'scrap'::text AS source
            FROM job_scraps js
            JOIN users u ON u.id = js.user_id
            WHERE js.job_id IN (SELECT job_id FROM seed)
              AND js.user_id <> $2
              AND ($3::int IS NULL OR u.school_id = $3 OR js.school_id = $3)
          ),
          peers AS (SELECT DISTINCT user_id FROM peer_events),
          co AS (
            SELECT ja.job_id, 'apply'::text AS source, COUNT(DISTINCT ja.user_id)::int AS support
            FROM job_applications ja
            JOIN peers p ON p.user_id = ja.user_id
            JOIN users u ON u.id = ja.user_id
            WHERE ja.job_id NOT IN (SELECT job_id FROM seed)
              AND ($3::int IS NULL OR u.school_id = $3)
            GROUP BY ja.job_id
            UNION ALL
            SELECT js.job_id, 'scrap'::text AS source, COUNT(DISTINCT js.user_id)::int AS support
            FROM job_scraps js
            JOIN peers p ON p.user_id = js.user_id
            JOIN users u ON u.id = js.user_id
            WHERE js.job_id NOT IN (SELECT job_id FROM seed)
              AND ($3::int IS NULL OR u.school_id = $3 OR js.school_id = $3)
            GROUP BY js.job_id
          ),
          agg AS (
            SELECT job_id,
                   SUM(support)::int AS support,
                   SUM(CASE WHEN source = 'apply' THEN support ELSE 0 END)::int AS apply_support,
                   SUM(CASE WHEN source = 'scrap' THEN support ELSE 0 END)::int AS scrap_support
            FROM co
            GROUP BY job_id
          )
     SELECT a.job_id, a.support, a.apply_support, a.scrap_support,
            j.title, j.description, j.location, j.salary_range, j.deadline,
            j.job_type, j.status, j.company_id, j.school_id,
            u.name AS company_name
     FROM agg a
     JOIN jobs j ON j.id = a.job_id AND j.status = 'active'
     LEFT JOIN users u ON u.id = j.company_id
     WHERE ($3::int IS NULL OR j.school_id = $3)
     ORDER BY a.support DESC, a.job_id DESC
     LIMIT $4`,
    [seedIds, userId, schoolId, limit]
  );

  const maxSupport = peerRes.rows.reduce((m, r) => Math.max(m, r.support), 1);
  const recommendations = peerRes.rows.map((r) => {
    const reasons = [];
    if (r.apply_support > 0) {
      reasons.push({
        code: 'also_applied',
        label: `함께 지원한 공고 (동료 ${r.apply_support}명)`,
        weight: Number((0.15 + 0.35 * (r.apply_support / maxSupport)).toFixed(3)),
        support: r.apply_support,
      });
    }
    if (r.scrap_support > 0) {
      reasons.push({
        code: 'also_scraped',
        label: `함께 관심(스크랩)한 공고 (동료 ${r.scrap_support}명)`,
        weight: Number((0.1 + 0.25 * (r.scrap_support / maxSupport)).toFixed(3)),
        support: r.scrap_support,
      });
    }
    const score = Number(Math.min(1, reasons.reduce((s, x) => s + x.weight, 0)).toFixed(4));
    return {
      job_id: r.job_id,
      score,
      reasons,
      support: r.support,
      job: {
        id: r.job_id,
        title: r.title,
        description: r.description,
        location: r.location,
        salary_range: r.salary_range,
        deadline: r.deadline,
        job_type: r.job_type,
        status: r.status,
        company_id: r.company_id,
        company_name: r.company_name,
        school_id: r.school_id,
      },
    };
  });

  return {
    recommendations,
    seed_count: seedIds.length,
    seed_job_ids: seedIds,
    scoring_factors: ['also_applied', 'also_scraped'],
  };
}

module.exports = {
  tokenize,
  extractResumeProfile,
  extractJobTokens,
  scoreJob,
  recomputeForUser,
  recomputeSchool,
  recomputeAllActiveSchools,
  associatedForUser,
};
