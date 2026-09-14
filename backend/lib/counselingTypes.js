'use strict';

/** Canonical P0 types plus v1 values kept for existing rows. */
const COUNSELING_TYPES = [
  '진학상담',
  '취업상담',
  '생활상담',
  '심리상담',
  '진로상담',
  '학습상담',
  '기타',
];

function isValidCounselingType(type) {
  return COUNSELING_TYPES.includes(type);
}

module.exports = { COUNSELING_TYPES, isValidCounselingType };
