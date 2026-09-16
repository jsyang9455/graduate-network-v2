#!/usr/bin/env bash
# Curl /api/health + /api/auth/login via nginx (and optional public BASE_URL).
# Exit 0 only when health is 200 and at least one DX login returns 200 + token.
#
# Usage (from repo root, stack already up):
#   ./scripts/verify-login.sh
#   BASE_URL=http://127.0.0.1:8090 ./scripts/verify-login.sh
#   BASE_URL=http://3.36.228.193:8090 ./scripts/verify-login.sh
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
fi

PORT="${FRONTEND_PORT:-8090}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}}"
BASE_URL="${BASE_URL%/}"

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
NC=$'\033[0m'

fail() { echo "${RED}[FAIL]${NC} $*" >&2; exit 1; }
ok() { echo "${GREEN}[OK]${NC} $*"; }

curl_status_body() {
  local method="$1" url="$2" data="${3:-}"
  local tmp code
  tmp="$(mktemp)"
  if [[ -n "$data" ]]; then
    code="$(curl -sS -o "$tmp" -w '%{http_code}' --connect-timeout 5 --max-time 20 \
      -X "$method" "$url" -H 'Content-Type: application/json' -d "$data" 2>/dev/null || true)"
  else
    code="$(curl -sS -o "$tmp" -w '%{http_code}' --connect-timeout 5 --max-time 20 \
      -X "$method" "$url" 2>/dev/null || true)"
  fi
  if [[ ! "$code" =~ ^[0-9]{3}$ ]]; then
    code="000"
  fi
  printf '%s\t' "$code"
  cat "$tmp"
  rm -f "$tmp"
}

echo "verify-login against ${BASE_URL}"
echo ""

# --- health ---
health_out="$(curl_status_body GET "${BASE_URL}/api/health")"
health_code="${health_out%%$'\t'*}"
health_body="${health_out#*$'\t'}"
echo "GET  /api/health → HTTP ${health_code}"
echo "  body: ${health_body}"
[[ "$health_code" == "200" ]] || fail "health expected 200, got ${health_code} (nginx down / proxy / backend)"

# --- logins ---
declare -a ACCOUNTS=(
  'student@jjob.com'
  'choi.seungmin@example.com'
)
login_ok=0
last_login_code=""
last_login_body=""

for email in "${ACCOUNTS[@]}"; do
  payload="$(printf '{"email":"%s","password":"password123"}' "$email")"
  out="$(curl_status_body POST "${BASE_URL}/api/auth/login" "$payload")"
  code="${out%%$'\t'*}"
  body="${out#*$'\t'}"
  last_login_code="$code"
  last_login_body="$body"
  echo "POST /api/auth/login (${email}) → HTTP ${code}"
  echo "  body: ${body}"
  if [[ "$code" == "200" ]] && echo "$body" | grep -q '"token"'; then
    login_ok=1
    ok "login works for ${email}"
    break
  fi
done

if [[ "$login_ok" -ne 1 ]]; then
  echo ""
  case "$last_login_code" in
    404)
      fail "login 404 — nginx still stripping /api/* (rebuild/restart frontend; see docs/deploy-aws.md §11.4b)"
      ;;
    401)
      fail "login 401 — DX/seed accounts missing or password_hash ≠ password123. Run: ./scripts/load-test-accounts.sh"
      ;;
    502|000)
      fail "login ${last_login_code} — backend/nginx connectivity. Check: docker compose ps && docker compose logs backend --tail=80"
      ;;
    *)
      fail "login failed (HTTP ${last_login_code}). body=${last_login_body}"
      ;;
  esac
fi

echo ""
ok "health=200 and login=200 — ${BASE_URL} is usable"
exit 0
