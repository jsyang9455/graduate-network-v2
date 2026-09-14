'use strict';

/**
 * Background jobs (REQ-PLT-005, REQ-REC-005).
 * Worknet / Alimtalk remain gated elsewhere.
 */

function startCronJobs() {
  if (process.env.DISABLE_CRON === '1' || process.env.NODE_ENV === 'test') {
    return null;
  }

  let cron;
  try {
    cron = require('node-cron');
  } catch {
    console.warn('⚠️  node-cron not installed; recommendation cron disabled');
    return null;
  }

  const recommendations = require('../modules/recommendations');
  // Daily 02:15 KST-ish (server local) recompute
  const task = cron.schedule(process.env.RECOMMENDATION_CRON || '15 2 * * *', async () => {
    try {
      console.log('🔄 Recommendation recompute started');
      const results = await recommendations.recomputeAllActiveSchools();
      console.log('✅ Recommendation recompute done', JSON.stringify(results.map((r) => ({
        schoolId: r.schoolId, users: r.users,
      }))));
    } catch (err) {
      console.error('❌ Recommendation cron failed:', err.message);
    }
  });

  return task;
}

module.exports = { startCronJobs };
