const STATUS_LABELS = {
  pending: '접수',
  reviewed: '서류검토',
  interviewed: '면접',
  accepted: '합격',
  rejected: '불합격',
};

const ALLOWED_TRANSITIONS = {
  pending: ['reviewed', 'rejected'],
  reviewed: ['interviewed', 'accepted', 'rejected'],
  interviewed: ['accepted', 'rejected'],
  accepted: [],
  rejected: [],
};

function isValidStatus(status) {
  return Object.prototype.hasOwnProperty.call(STATUS_LABELS, status);
}

function canTransition(from, to) {
  if (!isValidStatus(from) || !isValidStatus(to)) return false;
  return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

module.exports = {
  STATUS_LABELS,
  ALLOWED_TRANSITIONS,
  isValidStatus,
  canTransition,
};
