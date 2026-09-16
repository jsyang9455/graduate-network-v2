#!/usr/bin/env bash
# jjobb_v2 — one-shot EC2/Docker bootstrap + health verify
# Primary path after clone + .env (see docs/deploy-aws.md).
#
# Usage (from repo root):
#   ./scripts/aws-up.sh
#   ./scripts/aws-up.sh --with-test-accounts
#   ./scripts/aws-up.sh --timeout 300
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

WITH_TEST_ACCOUNTS=0
HEALTH_TIMEOUT=240
HEALTH_URL="http://127.0.0.1/api/health"
POLL_INTERVAL=5

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'
NC=$'\033[0m'

log_info() { echo "${BLUE}[INFO]${NC} $*"; }
log_ok() { echo "${GREEN}[OK]${NC} $*"; }
log_warn() { echo "${YELLOW}[WARN]${NC} $*"; }
log_err() { echo "${RED}[ERROR]${NC} $*" >&2; }

usage() {
  cat <<'EOF'
Usage: ./scripts/aws-up.sh [options]

  --with-test-accounts   After healthy, run scripts/load-test-accounts.sh (dev/test only)
  --timeout SECONDS      Max wait for /api/health (default: 240)
  -h, --help             Show this help

Must run from the jjobb_v2 repo root (script enforces this).
Requires: docker compose v2.
If .env is missing or JWT_SECRET/DB_PASSWORD incomplete, runs scripts/init-env.sh
(copies .env.example and generates secrets — see docs/deploy-aws.md).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-test-accounts) WITH_TEST_ACCOUNTS=1; shift ;;
    --timeout)
      HEALTH_TIMEOUT="${2:?--timeout requires seconds}"
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    *)
      log_err "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

compose() {
  docker compose "$@"
}

die_diagnostics() {
  local reason="$1"
  log_err "$reason"
  echo ""
  log_info "=== diagnostics: docker compose ps -a ==="
  compose ps -a || true
  echo ""
  log_info "=== diagnostics: backend logs (tail 120) ==="
  compose logs backend --tail=120 || true
  echo ""
  log_info "=== diagnostics: postgres logs (tail 80) ==="
  compose logs postgres --tail=80 || true
  echo ""
  log_info "=== diagnostics: frontend logs (tail 40) ==="
  compose logs frontend --tail=40 || true
  echo ""
  log_err "FAILED — /api/health did not become healthy."
  log_err "Send the diagnostics above (ps + backend/postgres logs) when asking for help."
  exit 1
}

# --- preflight: repo root ---
if [[ ! -f "$ROOT/docker-compose.yml" ]] || [[ ! -d "$ROOT/backend" ]] || [[ ! -d "$ROOT/database" ]]; then
  log_err "Not a jjobb_v2 repo root (missing docker-compose.yml, backend/, or database/)."
  log_err "cd into the clone, then: ./scripts/aws-up.sh"
  exit 1
fi

# --- docker compose v2 ---
if ! command -v docker >/dev/null 2>&1; then
  log_err "docker not found. Install Docker Engine + compose plugin (docs/deploy-aws.md §3)."
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  log_err "docker compose (v2 plugin) not found. Install docker-compose-plugin."
  exit 1
fi

# --- .env secrets (REQ-NFR-010) ---
need_init=0
if [[ ! -f "$ROOT/.env" ]]; then
  log_warn "Missing .env — bootstrapping via scripts/init-env.sh"
  need_init=1
else
  # shellcheck disable=SC1091
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +a
  if [[ -z "${JWT_SECRET:-}" || "$JWT_SECRET" == "replace_with_long_random_string" ]]; then
    log_warn "JWT_SECRET missing/placeholder — fixing via scripts/init-env.sh"
    need_init=1
  fi
  if [[ -z "${DB_PASSWORD:-}" ]]; then
    log_warn "DB_PASSWORD empty — fixing via scripts/init-env.sh"
    need_init=1
  fi
fi

if [[ "$need_init" -eq 1 ]]; then
  chmod +x "$ROOT/scripts/init-env.sh" 2>/dev/null || true
  if [[ ! -f "$ROOT/scripts/init-env.sh" ]]; then
    log_err "scripts/init-env.sh not found. Manual fix:"
    log_err "  cp .env.example .env && openssl rand -base64 48   # paste as JWT_SECRET"
    log_err "  nano .env"
    exit 1
  fi
  "$ROOT/scripts/init-env.sh"
fi

# Re-load after possible init
# shellcheck disable=SC1091
set -a
# shellcheck source=/dev/null
source "$ROOT/.env"
set +a

missing=()
[[ -z "${JWT_SECRET:-}" || "$JWT_SECRET" == "replace_with_long_random_string" ]] && missing+=("JWT_SECRET")
[[ -z "${DB_PASSWORD:-}" ]] && missing+=("DB_PASSWORD")
if [[ ${#missing[@]} -gt 0 ]]; then
  log_err ".env incomplete: set ${missing[*]} (see .env.example / REQ-NFR-010)."
  log_err "  ./scripts/init-env.sh   # or: cp .env.example .env && nano .env"
  exit 1
fi
log_ok ".env has JWT_SECRET and DB_PASSWORD"

echo ""
echo "========================================================================"
echo "  jjobb_v2 aws-up — compose up + migrate + /api/health"
echo "========================================================================"
echo ""

# --- compose up ---
log_info "Building and starting containers (docker compose up -d --build)..."
compose up -d --build

# --- wait postgres healthy ---
log_info "Waiting for postgres to be healthy..."
deadline=$((SECONDS + HEALTH_TIMEOUT))
postgres_ok=0
while (( SECONDS < deadline )); do
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' graduate-network-db 2>/dev/null || echo missing)"
  if [[ "$health" == "healthy" ]]; then
    postgres_ok=1
    break
  fi
  echo "  … postgres health=${health} (retry in ${POLL_INTERVAL}s)"
  sleep "$POLL_INTERVAL"
done
if [[ "$postgres_ok" -ne 1 ]]; then
  die_diagnostics "Postgres did not become healthy within ${HEALTH_TIMEOUT}s."
fi
log_ok "Postgres is healthy"

# --- migrate (explicit volume; long-running backend also mounts ./database) ---
log_info "Running migrations (database volume → /database)..."
if ! compose run --rm \
  -v "${ROOT}/database:/database:ro" \
  backend npm run migrate; then
  die_diagnostics "Migration failed."
fi
log_ok "Migrations completed"

# Ensure app services are up after one-off migrate
log_info "Ensuring backend + frontend are up..."
compose up -d backend frontend
sleep 2

# --- poll /api/health via nginx ---
log_info "Polling ${HEALTH_URL} until HTTP 200 (timeout ${HEALTH_TIMEOUT}s)..."
deadline=$((SECONDS + HEALTH_TIMEOUT))
health_ok=0
last_code="n/a"
body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT

while (( SECONDS < deadline )); do
  code="$(curl -sS -o "$body_file" -w '%{http_code}' "$HEALTH_URL" 2>/dev/null || echo "000")"
  last_code="$code"
  if [[ "$code" == "200" ]]; then
    health_ok=1
    break
  fi
  backend_code="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:5000/api/health 2>/dev/null || echo "000")"
  echo "  … nginx=${code} backend:5000=${backend_code} (retry in ${POLL_INTERVAL}s)"
  sleep "$POLL_INTERVAL"
done

if [[ "$health_ok" -ne 1 ]]; then
  die_diagnostics "Health check timed out (last nginx HTTP ${last_code})."
fi

body="$(cat "$body_file" 2>/dev/null || true)"
log_ok "/api/health → 200 ${body}"

# --- optional DX accounts ---
if [[ "$WITH_TEST_ACCOUNTS" -eq 1 ]]; then
  log_info "Loading test accounts (--with-test-accounts)..."
  chmod +x "$ROOT/scripts/load-test-accounts.sh" 2>/dev/null || true
  "$ROOT/scripts/load-test-accounts.sh"
  log_ok "Test accounts loaded (dev/test only — do not leave on public prod)"
fi

# --- success ---
PUBLIC_HINT="<EC2공인IP>"
if command -v curl >/dev/null 2>&1; then
  meta="$(curl -sS --connect-timeout 2 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)"
  if [[ -n "$meta" && "$meta" != *"404"* && "$meta" =~ ^[0-9.]+$ ]]; then
    PUBLIC_HINT="$meta"
  fi
fi

echo ""
echo "========================================================================"
echo -e "  ${GREEN}SUCCESS${NC} — jjobb_v2 is up and /api/health returned 200"
echo "========================================================================"
echo ""
echo "Next (browser):"
echo "  http://${PUBLIC_HINT}/"
echo "  http://${PUBLIC_HINT}/login.html"
echo ""
echo "Tips: hard-refresh after deploy; SG must allow inbound 80."
echo "Logs:  docker compose logs -f backend"
echo ""
exit 0
