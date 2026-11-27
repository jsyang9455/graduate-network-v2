// 사업자등록번호: 숫자 10자리 + 국세청 검증번호 규칙
const WEIGHTS = [1, 3, 7, 1, 3, 7, 1, 3, 5];

function normalizeBizNo(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function isValidBizNo(value) {
  const digits = normalizeBizNo(value);
  if (!/^\d{10}$/.test(digits)) return false;
  const d = digits.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += d[i] * WEIGHTS[i];
  sum += Math.floor((d[8] * 5) / 10);
  return (10 - (sum % 10)) % 10 === d[9];
}

module.exports = { normalizeBizNo, isValidBizNo };
