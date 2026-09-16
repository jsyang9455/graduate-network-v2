#!/usr/bin/env bash
# jjobb_v2 — one-shot EC2/Docker bootstrap + health verify
# Primary path after clone + .env (see docs/deploy-aws.md).
#
# Usage (from repo root):
#   ./scripts/aws-up.sh
#   ./scripts/aws-up.sh --with-test-accounts   # force DX accounts
#   ./scripts/aws-up.sh --no-test-accounts     # skip (prod)
#   ./scripts/aws-up.sh --timeout 300
#
# Test accounts: default ON for non-prod (dedicated test EC2). Skip when
# DEPLOY_ENV=production|prod, LOAD_TEST_ACCOUNTS=0, or --no-test-accounts.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# -1 = decide after .env (non-prod default on); 0 = off; 1 = on
WITH_TEST_ACCOUNTS=-1
HEALTH_TIMEOUT=300
POLL_INTERVAL=5
# HEALTH_URL set after .env load (respects FRONTEND_PORT)

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

  --with-test-accounts   Force load database/test-accounts.sql (DX personas)
  --no-test-accounts     Skip test accounts (use on production)
  --timeout SECONDS      Max wait for /api/health (default: 300)
  -h, --help             Show this help

Test accounts (student@jjob.com / password123, …):
  Default: load on non-prod EC2 (DEPLOY_ENV empty|test|dev).
  Skip when: --no-test-accounts | LOAD_TEST_ACCOUNTS=0 | DEPLOY_ENV=production|prod
  Force when: --with-test-accounts | LOAD_TEST_ACCOUNTS=1

Must run from the jjobb_v2 repo root (script enforces this).
Requires: docker compose v2.
If .env is missing or JWT_SECRET/DB_PASSWORD incomplete, runs scripts/init-env.sh
(copies .env.example and generates secrets — see docs/deploy-aws.md).
Default FRONTEND_PORT=8090 (SG must allow 8090). Override: FRONTEND_PORT=80 ./scripts/aws-up.sh
After nginx.conf changes: this script rebuilds images (required — conf is baked in).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-test-accounts) WITH_TEST_ACCOUNTS=1; shift ;;
    --no-test-accounts) WITH_TEST_ACCOUNTS=0; shift ;;
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

container_health() {
  local name="$1"
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$name" 2>/dev/null || echo missing
}

# curl -w '%{http_code}' already prints 000 on connect failure; do NOT also
# `|| echo 000` or the code becomes "000000" and never matches "200".
curl_http_code() {
  local url="$1"
  local out_file="${2:-/dev/null}"
  local code
  code="$(curl -sS -o "$out_file" -w '%{http_code}' --connect-timeout 2 --max-time 5 "$url" 2>/dev/null || true)"
  if [[ "$code" =~ ^[0-9]{3}$ ]]; then
    printf '%s' "$code"
  else
    printf '000'
  fi
}

container_state() {
  local name="$1"
  docker inspect -f 'status={{.State.Status}} exit={{.State.ExitCode}} err={{.State.Error}} oom={{.State.OOMKilled}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' "$name" 2>/dev/null || echo "missing"
}

# Host publish port for frontend nginx (compose: "0.0.0.0:${FRONTEND_PORT:-8090}:80")
frontend_host_port() {
  echo "${FRONTEND_PORT:-8090}"
}

# Actual HostPort published for container :80 (empty if Created / not published).
frontend_published_host_port() {
  docker inspect -f '{{with index .NetworkSettings.Ports "80/tcp"}}{{with index . 0}}{{.HostPort}}{{end}}{{end}}' \
    graduate-network-frontend 2>/dev/null || true
}

frontend_container_status() {
  docker inspect -f '{{.State.Status}}' graduate-network-frontend 2>/dev/null || echo missing
}

# True when docker-proxy (or process) is listening on the expected host port.
host_port_listening() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -lptn "sport = :${port}" 2>/dev/null | grep -q ":${port}" && return 0
    return 1
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1 && return 0
    return 1
  fi
  # Fallback: TCP connect (0 = something accepted or refused differently than "no route")
  curl -sS -o /dev/null --connect-timeout 1 --max-time 2 "http://127.0.0.1:${port}/" 2>/dev/null
  local rc=$?
  # curl 7 = connection refused → not listening
  [[ "$rc" -eq 0 || "$rc" -eq 22 || "$rc" -eq 52 || "$rc" -eq 56 ]] && return 0
  return 1
}

port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -lptn "sport = :${port}" 2>/dev/null | grep -q ":${port}" && return 0
    return 1
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1 && return 0
    return 1
  fi
  return 1
}

# Extra diagnostics when host nginx path returns 000 but backend :5000 is 200.
dump_nginx_zero_diagnostics() {
  local port
  port="$(frontend_host_port)"
  echo ""
  log_info "=== nginx=000 diagnostics (frontend claimed up, host :${port} not answering) ==="
  log_info "docker compose ps frontend"
  compose ps frontend || true
  echo ""
  log_info "frontend state / published ports"
  echo "  $(container_state graduate-network-frontend)"
  echo "  status=$(frontend_container_status) published_host_port=$(frontend_published_host_port)"
  docker port graduate-network-frontend 2>/dev/null || echo "  (docker port: none — PORTS empty or container not running)"
  echo ""
  log_info "docker compose logs frontend --tail=50"
  compose logs frontend --tail=50 || true
  echo ""
  log_info "curl -v http://127.0.0.1:${port}/  (and /api/health)"
  curl -v --connect-timeout 2 --max-time 5 "http://127.0.0.1:${port}/" 2>&1 | sed 's/^/  /' || true
  curl -v --connect-timeout 2 --max-time 5 "http://127.0.0.1:${port}/api/health" 2>&1 | sed 's/^/  /' || true
  echo ""
  log_info "in-container → backend (DNS + proxy upstream)"
  if [[ "$(frontend_container_status)" == "running" ]]; then
    compose exec -T frontend wget -qO- http://backend:5000/api/health 2>&1 | sed 's/^/  /' || \
      echo "  (exec wget failed — network/DNS or frontend not running)"
  else
    echo "  skipped — frontend not running"
  fi
  echo ""
  if command -v ss >/dev/null 2>&1; then
    log_info "ss -lptn 'sport = :${port}'"
    ss -lptn "sport = :${port}" 2>/dev/null || true
    echo ""
  fi
}

is_address_in_use_error() {
  local text="$1"
  [[ "$text" == *"address already in use"* ]] || \
    [[ "$text" == *"bind: address already in use"* ]] || \
    [[ "$text" == *"failed to bind host port"* ]]
}

hint_port_conflict() {
  local port
  port="$(frontend_host_port)"
  echo ""
  log_err "=== host port ${port} is already in use (NOT a backend failure) ==="
  echo "  Docker cannot publish 0.0.0.0:${port}/tcp for the frontend nginx container."
  echo "  Backend/postgres may be healthy; frontend stays Created until the port is free."
  echo ""
  log_info "See who holds :${port}:"
  echo "  ss -lptn 'sport = :${port}'"
  echo "  # or: sudo lsof -iTCP:${port} -sTCP:LISTEN"
  echo ""
  log_info "Option A — free the host port, then re-run:"
  echo "  ss -lptn 'sport = :${port}'"
  echo "  # if another container/process holds it, stop it, then:"
  echo "  ./scripts/aws-up.sh"
  echo ""
  log_info "Option B — use a different host port (SG must allow it):"
  echo "  FRONTEND_PORT=8091 ./scripts/aws-up.sh"
  echo "  # then browse http://<EC2공인IP>:8091/"
  echo ""
  log_info "Default is FRONTEND_PORT=8090 (not 80) so host nginx on :80 is usually fine."
  echo ""
}

hint_backend_failure() {
  echo ""
  log_info "=== hint: common causes of 'dependency backend failed to start' ==="
  echo "  1) Backend never became healthy (migrate crash / DB auth / missing /database mount)"
  echo "  2) Healthcheck exhausted retries before listen (slow EC2) — pull latest compose start_period"
  echo "  3) DB_PASSWORD in .env ≠ password baked into existing postgres_data volume"
  echo "  4) JWT_SECRET missing (compose refuses to start backend)"
  echo ""
  log_info "Look in backend logs for:"
  echo "  - password authentication failed"
  echo "  - Failed to apply migrations"
  echo "  - Migrations directory not found"
  echo "  - Database not ready"
  echo ""
  log_info "Quick checks:"
  echo "  docker compose ps -a"
  echo "  docker compose logs backend --tail=120"
  echo "  docker inspect graduate-network-backend --format '{{.State.Status}} {{.State.Health.Status}} {{.State.Error}}'"
  echo "  # password mismatch (data wipe OK): docker compose down -v && ./scripts/aws-up.sh"
}

# True when frontend did not publish host :FRONTEND_PORT (Created / empty PORTS).
frontend_publish_broken() {
  local st pub
  st="$(frontend_container_status)"
  pub="$(frontend_published_host_port)"
  [[ "$st" == "created" || "$st" == "exited" || "$st" == "dead" || "$st" == "missing" ]] && return 0
  [[ -z "$pub" ]] && return 0
  return 1
}

# After compose up -d frontend: must be running with a HostPort (else nginx=000 forever).
verify_frontend_published() {
  local st pub
  # Brief settle for docker-proxy
  sleep 1
  st="$(frontend_container_status)"
  pub="$(frontend_published_host_port)"
  echo "  frontend status=${st} published_host_port=${pub:-<empty>}"
  if [[ "$st" != "running" ]]; then
    dump_nginx_zero_diagnostics
    if port_in_use "$(frontend_host_port)" || [[ "$st" == "created" ]]; then
      die_diagnostics "Frontend is ${st} (not running) — host :$(frontend_host_port) likely not published (port conflict or crash)."
    fi
    die_diagnostics "Frontend is ${st} after compose up (expected running)."
  fi
  if [[ -z "$pub" ]]; then
    dump_nginx_zero_diagnostics
    die_diagnostics "Frontend is running but PORTS empty (host :$(frontend_host_port) not published) — curl will stay nginx=000."
  fi
  if [[ "$pub" != "$(frontend_host_port)" ]]; then
    log_warn "Published HostPort=${pub} differs from FRONTEND_PORT=$(frontend_host_port) — health URL may be wrong."
  fi
}

die_diagnostics() {
  local reason="$1"
  local extra_err="${2:-}"
  local combined="${reason}"$'\n'"${extra_err}"
  local port_conflict=0
  local backend_h
  local fe_status
  local fe_pub
  backend_h="$(container_health graduate-network-backend)"
  fe_status="$(frontend_container_status)"
  fe_pub="$(frontend_published_host_port)"

  if is_address_in_use_error "$combined"; then
    port_conflict=1
  elif frontend_publish_broken; then
    # Created / empty PORTS / exited while backend healthy → bind conflict or crash
    if [[ "$backend_h" == "healthy" ]]; then
      port_conflict=1
    fi
  elif port_in_use "$(frontend_host_port)"; then
    # Frontend Created + healthy backend + host port busy → almost always bind conflict
    if [[ "$backend_h" == "healthy" && ( "$fe_status" == "created" || "$fe_status" == "missing" || "$fe_status" == "exited" ) ]]; then
      port_conflict=1
    fi
  fi

  log_err "$reason"
  if [[ -n "$extra_err" ]]; then
    echo "$extra_err" | sed 's/^/  /' >&2 || true
  fi
  echo ""
  log_info "=== diagnostics: docker compose ps -a ==="
  compose ps -a || true
  echo ""
  log_info "=== diagnostics: backend state ==="
  echo "  $(container_state graduate-network-backend)"
  log_info "=== diagnostics: postgres state ==="
  echo "  $(container_state graduate-network-db)"
  log_info "=== diagnostics: frontend state ==="
  echo "  $(container_state graduate-network-frontend)"
  echo "  published_host_port=${fe_pub:-<empty>}"
  echo ""

  # Always dump nginx=000 style evidence when backend is healthy (path-A vs path-B).
  if [[ "$backend_h" == "healthy" ]]; then
    dump_nginx_zero_diagnostics
  fi

  if [[ "$port_conflict" -eq 1 ]]; then
    hint_port_conflict
    if command -v ss >/dev/null 2>&1; then
      log_info "=== ss -lptn 'sport = :$(frontend_host_port)' ==="
      ss -lptn "sport = :$(frontend_host_port)" 2>/dev/null || true
      echo ""
    fi
    log_err "FAILED — frontend host port $(frontend_host_port) not usable (in use / PORTS empty / Created)."
    log_err "Do not treat this as a backend dependency failure when backend is healthy."
    exit 1
  fi

  log_info "=== diagnostics: backend logs (tail 120) ==="
  compose logs backend --tail=120 || true
  echo ""
  log_info "=== diagnostics: postgres logs (tail 80) ==="
  compose logs postgres --tail=80 || true
  echo ""
  log_info "=== diagnostics: frontend logs (tail 40) ==="
  compose logs frontend --tail=40 || true
  # Only blame backend when it is not healthy
  if [[ "$backend_h" != "healthy" ]]; then
    hint_backend_failure
  else
    echo ""
    log_info "Backend is healthy — this is unlikely a 'dependency backend failed' root cause."
    log_info "Check frontend bind/ports and: ss -lptn 'sport = :$(frontend_host_port)'"
    log_info "Browser URL uses FRONTEND_PORT (default 8090). Open SG inbound TCP $(frontend_host_port)."
  fi
  echo ""
  log_err "FAILED — /api/health did not become healthy."
  log_err "Send the diagnostics above (ps + relevant logs) when asking for help."
  exit 1
}

wait_container_healthy() {
  local name="$1"
  local label="$2"
  local deadline=$((SECONDS + HEALTH_TIMEOUT))
  local attempt=0
  local last_msg=""
  while (( SECONDS < deadline )); do
    local health
    health="$(container_health "$name")"
    if [[ "$health" == "healthy" ]]; then
      return 0
    fi
    # Exited/restarting with Error → fail fast with diagnostics
    local status
    status="$(docker inspect -f '{{.State.Status}}' "$name" 2>/dev/null || echo missing)"
    if [[ "$status" == "exited" || "$status" == "dead" ]]; then
      die_diagnostics "${label} container is ${status} (health=${health}). Often: migrate crash or DB auth."
    fi
    attempt=$((attempt + 1))
    local msg="${label} health=${health} status=${status}"
    # Print on status change, then every 6th attempt (~30s) — not every poll
    if [[ "$msg" != "$last_msg" ]] || (( attempt == 1 || attempt % 6 == 0 )); then
      echo "  … ${msg} (attempt ${attempt}, retry in ${POLL_INTERVAL}s)"
      last_msg="$msg"
    fi
    sleep "$POLL_INTERVAL"
  done
  die_diagnostics "${label} did not become healthy within ${HEALTH_TIMEOUT}s."
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

# Ensure FRONTEND_PORT is persisted for compose (default 8090) even when secrets already exist
if [[ -z "${FRONTEND_PORT:-}" ]]; then
  log_warn "FRONTEND_PORT missing in .env — writing 8090 via init-env.sh"
  chmod +x "$ROOT/scripts/init-env.sh" 2>/dev/null || true
  "$ROOT/scripts/init-env.sh"
  # shellcheck disable=SC1091
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +a
fi

# Frontend host publish port (compose "0.0.0.0:${FRONTEND_PORT:-8090}:80")
FRONTEND_PORT="$(frontend_host_port)"
export FRONTEND_PORT
# Always include host port in health URL (default 8090 — never assume bare :80).
HEALTH_URL="http://127.0.0.1:${FRONTEND_PORT}/api/health"

echo ""
echo "========================================================================"
echo "  jjobb_v2 aws-up — postgres → migrate → backend → frontend → /api/health"
echo "========================================================================"
echo "  FRONTEND_PORT=${FRONTEND_PORT}  (health: ${HEALTH_URL})"
echo "  SG inbound must allow TCP ${FRONTEND_PORT} (default 8090; host :80 optional)"
echo ""

# Staged bring-up avoids: frontend depends_on backend healthy while backend is
# still migrating / crash-looping → "dependency backend failed to start".
log_info "Building images (docker compose build)..."
if ! compose build; then
  die_diagnostics "docker compose build failed."
fi

log_info "Starting postgres..."
if ! compose up -d postgres; then
  die_diagnostics "Failed to start postgres (compose up)."
fi
wait_container_healthy graduate-network-db "Postgres"
log_ok "Postgres is healthy"

# --- migrate before long-running backend (same /database mount) ---
log_info "Running migrations (database volume → /database)..."
if ! compose run --rm \
  -v "${ROOT}/database:/database:ro" \
  backend npm run migrate; then
  die_diagnostics "Migration failed (check DB_PASSWORD vs existing postgres_data volume)."
fi
log_ok "Migrations completed"

log_info "Starting backend..."
if ! compose up -d backend; then
  die_diagnostics "Failed to start backend — often 'dependency postgres failed' or JWT/.env."
fi
wait_container_healthy graduate-network-backend "Backend"
log_ok "Backend is healthy"

# Preflight: fail fast if host port held by something other than our running frontend
fe_pre_st="$(frontend_container_status)"
fe_pre_pub="$(frontend_published_host_port)"
if port_in_use "$FRONTEND_PORT"; then
  if [[ "$fe_pre_st" == "running" && "$fe_pre_pub" == "$FRONTEND_PORT" ]]; then
    log_info "Host :${FRONTEND_PORT} already owned by running frontend — will recreate/verify."
  else
    log_warn "Host port ${FRONTEND_PORT} is in use and frontend is not publishing it (status=${fe_pre_st} pub=${fe_pre_pub:-empty})."
    if command -v ss >/dev/null 2>&1; then
      ss -lptn "sport = :${FRONTEND_PORT}" 2>/dev/null || true
    fi
    die_diagnostics "Host port ${FRONTEND_PORT} already in use — free it or set FRONTEND_PORT=8091 in .env."
  fi
fi

# Clear leftover Created/exited from a prior bind failure (empty PORTS → nginx=000).
if [[ "$fe_pre_st" == "created" || "$fe_pre_st" == "exited" || "$fe_pre_st" == "dead" ]]; then
  log_warn "Removing leftover frontend (status=${fe_pre_st}) before recreate..."
  compose rm -f frontend >/dev/null 2>&1 || true
fi

log_info "Starting frontend (waits on backend healthy; host port ${FRONTEND_PORT})..."
frontend_err="$(mktemp)"
set +e
# --force-recreate clears stale Created containers that compose may treat as "done"
compose up -d --force-recreate frontend >"$frontend_err" 2>&1
frontend_rc=$?
set -e
if [[ "$frontend_rc" -ne 0 ]]; then
  fe_out="$(cat "$frontend_err" 2>/dev/null || true)"
  rm -f "$frontend_err"
  if is_address_in_use_error "$fe_out" || port_in_use "$FRONTEND_PORT"; then
    die_diagnostics "Failed to start frontend — host port ${FRONTEND_PORT} already in use." "$fe_out"
  fi
  die_diagnostics "Failed to start frontend." "$fe_out"
fi
rm -f "$frontend_err"
verify_frontend_published
log_ok "Frontend running (host :${FRONTEND_PORT} → container :80, published=$(frontend_published_host_port))"

# --- poll /api/health via nginx ---
log_info "Polling ${HEALTH_URL} until HTTP 200 (timeout ${HEALTH_TIMEOUT}s)..."
log_info "Progress lines print on change or ~every 30s (not every poll). Ctrl+C aborts the script only."
deadline=$((SECONDS + HEALTH_TIMEOUT))
health_ok=0
last_code="n/a"
attempt=0
last_msg=""
dumped_nginx_zero=0
body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT

while (( SECONDS < deadline )); do
  code="$(curl_http_code "$HEALTH_URL" "$body_file")"
  last_code="$code"
  if [[ "$code" == "200" ]]; then
    health_ok=1
    break
  fi
  backend_code="$(curl_http_code "http://127.0.0.1:5000/api/health")"
  attempt=$((attempt + 1))
  msg="nginx=${code} backend:5000=${backend_code}"
  if [[ "$msg" != "$last_msg" ]] || (( attempt == 1 || attempt % 6 == 0 )); then
    echo "  … ${msg} (attempt ${attempt}, retry in ${POLL_INTERVAL}s)"
    last_msg="$msg"
  fi
  # nginx=000 + backend 200 → host port not answering; dump once and fail fast if PORTS broken
  if [[ "$backend_code" == "200" && "$code" == "000" && "$attempt" -ge 2 ]]; then
    if [[ "$dumped_nginx_zero" -eq 0 ]]; then
      dumped_nginx_zero=1
      dump_nginx_zero_diagnostics
    fi
    if frontend_publish_broken; then
      die_diagnostics "nginx=000 with empty/missing frontend publish (status=$(frontend_container_status))."
    fi
    # Still running with ports but not answering → crash-loop / wrong listen; fail before full timeout
    if [[ "$attempt" -ge 6 ]]; then
      die_diagnostics "nginx=000 for ~30s while backend:5000=200 — frontend not accepting on :${FRONTEND_PORT}."
    fi
  fi
  sleep "$POLL_INTERVAL"
done

if [[ "$health_ok" -ne 1 ]]; then
  die_diagnostics "Health check timed out (last nginx HTTP ${last_code})."
fi

body="$(cat "$body_file" 2>/dev/null || true)"
log_ok "/api/health → 200 ${body}"

# --- DX test accounts (default on for non-prod; seed.sql ≠ TEST-ACCOUNTS.md emails) ---
DEPLOY_ENV_NORM="$(echo "${DEPLOY_ENV:-}" | tr '[:upper:]' '[:lower:]')"
LOAD_FLAG_NORM="$(echo "${LOAD_TEST_ACCOUNTS:-}" | tr '[:upper:]' '[:lower:]')"
if [[ "$WITH_TEST_ACCOUNTS" -eq -1 ]]; then
  if [[ "$LOAD_FLAG_NORM" == "1" || "$LOAD_FLAG_NORM" == "true" || "$LOAD_FLAG_NORM" == "yes" ]]; then
    WITH_TEST_ACCOUNTS=1
  elif [[ "$LOAD_FLAG_NORM" == "0" || "$LOAD_FLAG_NORM" == "false" || "$LOAD_FLAG_NORM" == "no" ]]; then
    WITH_TEST_ACCOUNTS=0
  elif [[ "$DEPLOY_ENV_NORM" == "production" || "$DEPLOY_ENV_NORM" == "prod" ]]; then
    WITH_TEST_ACCOUNTS=0
  else
    # Dedicated test EC2 / empty DEPLOY_ENV → load DX personas by default
    WITH_TEST_ACCOUNTS=1
  fi
fi

if [[ "$WITH_TEST_ACCOUNTS" -eq 1 ]]; then
  log_info "Loading DX test accounts (database/test-accounts.sql)..."
  chmod +x "$ROOT/scripts/load-test-accounts.sh" 2>/dev/null || true
  "$ROOT/scripts/load-test-accounts.sh"
  log_ok "Test accounts loaded (dev/test only — skip with --no-test-accounts on prod)"
else
  log_info "Skipped test accounts (prod / --no-test-accounts / LOAD_TEST_ACCOUNTS=0)."
  log_info "  Later: ./scripts/load-test-accounts.sh"
fi

# --- success ---
PUBLIC_HINT="<EC2공인IP>"
if command -v curl >/dev/null 2>&1; then
  meta="$(curl -sS --connect-timeout 2 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)"
  if [[ -n "$meta" && "$meta" != *"404"* && "$meta" =~ ^[0-9.]+$ ]]; then
    PUBLIC_HINT="$meta"
  fi
fi

# Default FRONTEND_PORT=8090 → always show :port unless explicitly 80
BASE_URL="http://${PUBLIC_HINT}:${FRONTEND_PORT}"
if [[ "$FRONTEND_PORT" == "80" ]]; then
  BASE_URL="http://${PUBLIC_HINT}"
fi

echo ""
echo "========================================================================"
echo -e "  ${GREEN}SUCCESS${NC} — jjobb_v2 is up and /api/health returned 200"
echo "========================================================================"
echo ""
echo "Next (browser):"
echo "  ${BASE_URL}/"
echo "  ${BASE_URL}/login.html"
echo ""
if [[ "$WITH_TEST_ACCOUNTS" -eq 1 ]]; then
  echo "DX login (password for all: password123):"
  echo "  student@jjob.com | graduate@jjob.com | teacher@jjob.com"
  echo "  company@jjob.com | admin@jjob.com"
  echo ""
  echo "Verify:"
  echo "  curl -sS -X POST ${BASE_URL}/api/auth/login -H 'Content-Type: application/json' \\"
  echo "    -d '{\"email\":\"student@jjob.com\",\"password\":\"password123\"}'"
  echo ""
fi
echo "Tips: hard-refresh (Ctrl+Shift+R) after deploy; SG must allow TCP ${FRONTEND_PORT}."
echo "If login was 404 while /api/health was 200: rebuild frontend (nginx.conf baked in)."
echo "Logs:  docker compose logs -f backend"
echo ""
exit 0
