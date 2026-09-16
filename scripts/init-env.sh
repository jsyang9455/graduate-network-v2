#!/usr/bin/env bash
# jjobb_v2 — ensure root .env exists with JWT_SECRET (+ DB_PASSWORD if needed).
# REQ-NFR-010. Does not print or commit secrets.
#
# Usage (from repo root):
#   ./scripts/init-env.sh
#   ./scripts/init-env.sh --force-jwt   # regenerate JWT_SECRET even if set
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FORCE_JWT=0
ENV_FILE="$ROOT/.env"
EXAMPLE="$ROOT/.env.example"

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
Usage: ./scripts/init-env.sh [options]

  --force-jwt   Always regenerate JWT_SECRET
  -h, --help    Show this help

Creates .env from .env.example if missing, then fills JWT_SECRET
(and DB_PASSWORD when empty or still the example default "postgres").
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force-jwt) FORCE_JWT=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *)
      log_err "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ ! -f "$ROOT/docker-compose.yml" ]]; then
  log_err "Not a jjobb_v2 repo root (missing docker-compose.yml)."
  exit 1
fi

if [[ ! -f "$EXAMPLE" ]]; then
  log_err "Missing .env.example — cannot bootstrap .env."
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  log_err "openssl not found (needed to generate secrets)."
  exit 1
fi

# Upsert KEY=value without echoing secrets; safe for base64 (+/=).
upsert_env() {
  local key="$1" value="$2" file="$3"
  local tmp found=0
  tmp="$(mktemp)"
  # shellcheck disable=SC2094
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "${key}="* ]]; then
      printf '%s=%s\n' "$key" "$value"
      found=1
    else
      printf '%s\n' "$line"
    fi
  done < "$file" > "$tmp"
  if [[ "$found" -eq 0 ]]; then
    printf '%s=%s\n' "$key" "$value" >> "$tmp"
  fi
  mv "$tmp" "$file"
}

read_env_var() {
  local key="$1" file="$2"
  local line
  line="$(grep -E "^${key}=" "$file" 2>/dev/null | tail -n1 || true)"
  if [[ -z "$line" ]]; then
    echo ""
    return
  fi
  echo "${line#"${key}="}"
}

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$EXAMPLE" "$ENV_FILE"
  chmod 600 "$ENV_FILE" 2>/dev/null || true
  log_ok "Created .env from .env.example"
else
  log_info ".env already exists — will only fill missing/placeholder secrets"
fi

jwt_val="$(read_env_var JWT_SECRET "$ENV_FILE")"
need_jwt=0
if [[ "$FORCE_JWT" -eq 1 ]]; then
  need_jwt=1
elif [[ -z "$jwt_val" || "$jwt_val" == "replace_with_long_random_string" ]]; then
  need_jwt=1
fi

if [[ "$need_jwt" -eq 1 ]]; then
  jwt_new="$(openssl rand -base64 48 | tr -d '\n')"
  upsert_env JWT_SECRET "$jwt_new" "$ENV_FILE"
  log_ok "JWT_SECRET set (openssl rand -base64 48)"
else
  log_ok "JWT_SECRET already set — left unchanged"
fi

db_val="$(read_env_var DB_PASSWORD "$ENV_FILE")"
need_db=0
if [[ -z "$db_val" ]]; then
  need_db=1
elif [[ "$db_val" == "postgres" ]]; then
  # Example default — fine for disposable test EC2; rotate for anything exposed.
  need_db=1
fi

if [[ "$need_db" -eq 1 ]]; then
  db_new="$(openssl rand -base64 24 | tr -d '\n=/+' | cut -c1-32)"
  upsert_env DB_PASSWORD "$db_new" "$ENV_FILE"
  log_ok "DB_PASSWORD set to a random value"
  log_warn "Test/dev EC2: random DB_PASSWORD written. If postgres_data volume already exists with another password, keep the old value or run: docker compose down -v (WIPES DATA)."
else
  log_ok "DB_PASSWORD already set — left unchanged"
fi

# AWS default frontend host port (avoids host :80 nginx/apache conflicts).
fp_val="$(read_env_var FRONTEND_PORT "$ENV_FILE")"
if [[ -z "$fp_val" ]]; then
  upsert_env FRONTEND_PORT "8090" "$ENV_FILE"
  log_ok "FRONTEND_PORT=8090 set (AWS default — open SG TCP 8090)"
else
  log_ok "FRONTEND_PORT already set (${fp_val}) — left unchanged"
fi

log_info "Secrets are in .env only — never commit .env (REQ-NFR-010)."
exit 0
