'use strict';

const { query } = require('../config/database');
const { canonicalRole } = require('../lib/roles');
const { sendError } = require('../lib/httpErrors');

const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];

function isCompanyActor(user) {
  if (!user) return false;
  return user.user_type === 'company' || canonicalRole(user) === 'company';
}

/**
 * Company users must be approved before creating/updating jobs.
 * Staff (teacher / school_admin / system_admin) bypasses.
 * @returns {Promise<object|null>} company_profiles row, or null if not company
 */
async function loadCompanyApproval(userId) {
  const result = await query(
    `SELECT id, user_id, approval_status, approved_at, approved_by, rejection_reason
     FROM company_profiles
     WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function assertCompanyCanManageJobs(res, user) {
  if (!isCompanyActor(user)) return true;

  const profile = await loadCompanyApproval(user.id);
  if (profile && profile.approval_status === 'approved') return true;

  const status = profile?.approval_status || 'pending';
  const msg = status === 'rejected'
    ? '기업 승인이 반려되어 채용 공고를 등록·수정할 수 없습니다. 학교 관리자에게 문의하세요.'
    : '학교 승인 후 채용 공고를 등록·수정할 수 있습니다.';
  sendError(res, 403, 'COMPANY_NOT_APPROVED', msg);
  return false;
}

module.exports = {
  APPROVAL_STATUSES,
  isCompanyActor,
  loadCompanyApproval,
  assertCompanyCanManageJobs,
};
