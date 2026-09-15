'use strict';

const {
  canonicalRole, isSystemAdmin, isSchoolAdmin, isStaffAdmin,
  displayRoleLabel, displayRoleBadgeKey,
} = require('../lib/roles');
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('REQ-IAM-006 canonicalRole maps v1 admin to system_admin', () => {
  assert.equal(canonicalRole({ user_type: 'admin' }), 'system_admin');
  assert.equal(canonicalRole({ user_type: 'teacher' }), 'teacher');
  assert.equal(canonicalRole({ user_type: 'school_admin' }), 'school_admin');
  assert.equal(canonicalRole({ role: 'system_admin', user_type: 'admin' }), 'system_admin');
});

test('REQ-IAM-006 displayRoleLabel maps admin to 시스템 관리자', () => {
  assert.equal(displayRoleLabel({ user_type: 'admin' }), '시스템 관리자');
  assert.equal(displayRoleLabel('system_admin'), '시스템 관리자');
  assert.equal(displayRoleBadgeKey('admin'), 'system_admin');
  assert.equal(displayRoleLabel('school_admin'), '학교 관리자');
});

test('REQ-IAM-006 staff helpers', () => {
  assert.equal(isSystemAdmin({ user_type: 'admin' }), true);
  assert.equal(isSystemAdmin({ user_type: 'teacher' }), false);
  assert.equal(isSchoolAdmin({ user_type: 'school_admin' }), true);
  assert.equal(isStaffAdmin({ user_type: 'school_admin' }), true);
  assert.equal(isStaffAdmin({ user_type: 'student' }), false);
});
