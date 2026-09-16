#!/usr/bin/env bash
# Dev/test EC2 only — loads DX personas from TEST-ACCOUNTS.md (password123).
# Not applied by postgres initdb (seed.sql uses different emails). Safe to re-run.
# Invoked by: ./scripts/aws-up.sh (default non-prod) or manually after migrate.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f "$ROOT/database/test-accounts.sql" ]]; then
  echo "ERROR: database/test-accounts.sql not found" >&2
  exit 1
fi
if [[ ! -f "$ROOT/docker-compose.yml" ]]; then
  echo "ERROR: run from jjobb_v2 repo root (docker-compose.yml missing)" >&2
  exit 1
fi

DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-graduate_network}"
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
  DB_USER="${DB_USER:-postgres}"
  DB_NAME="${DB_NAME:-graduate_network}"
fi

if ! docker compose ps --status running postgres 2>/dev/null | grep -q .; then
  # compose ps format varies; fall back to container inspect
  st="$(docker inspect -f '{{.State.Status}}' graduate-network-db 2>/dev/null || echo missing)"
  if [[ "$st" != "running" ]]; then
    echo "ERROR: postgres container not running (status=${st}). Start with ./scripts/aws-up.sh first." >&2
    exit 1
  fi
fi

echo "Loading database/test-accounts.sql into ${DB_NAME} as ${DB_USER}..."
docker compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" < database/test-accounts.sql

echo "Verifying DX emails..."
count="$(docker compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -tAc \
  "SELECT COUNT(*) FROM users WHERE email IN (
     'student@jjob.com','graduate@jjob.com','teacher@jjob.com',
     'company@jjob.com','admin@jjob.com'
   ) AND is_active = true;")"
count="$(echo "$count" | tr -d '[:space:]')"
echo "  active DX users: ${count}"
if [[ -z "$count" || "$count" -lt 5 ]]; then
  echo "ERROR: expected 5 DX accounts, got '${count}'" >&2
  exit 1
fi

echo "Done. Try student@jjob.com / password123 on /login.html"
echo "  curl -sS -X POST http://127.0.0.1:\${FRONTEND_PORT:-8090}/api/auth/login \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"email\":\"student@jjob.com\",\"password\":\"password123\"}'"
