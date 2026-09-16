#!/usr/bin/env bash
# Dev/test EC2 only — loads DX personas from database/test-accounts.sql (password123).
# Not applied by postgres initdb (seed.sql uses different emails). Safe to re-run.
# Invoked by: ./scripts/aws-up.sh (default non-prod) or manually after migrate.
#
# test-accounts.sql UPSERTs by email (no DELETE users) so audit_logs.actor_id and
# other non-CASCADE FKs do not block reload on EC2 DBs that already logged DX actors.
#
# Reliability:
#  1) Apply SQL (UPSERT users + school + company approval)
#  2) Force-refresh password_hash via backend bcrypt (guards against stale SQL hashes)
#  3) Count DX rows
#  4) Curl login through nginx (scripts/verify-login.sh)
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
# Retry a few times — postgres can briefly refuse right after restart.
sql_ok=0
for attempt in 1 2 3 4 5; do
  if docker compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
    < database/test-accounts.sql; then
    sql_ok=1
    break
  fi
  echo "  … psql failed (attempt ${attempt}/5), retry in 3s"
  sleep 3
done
if [[ "$sql_ok" -ne 1 ]]; then
  echo "ERROR: failed to apply database/test-accounts.sql" >&2
  exit 1
fi

# Belt-and-suspenders: regenerate password123 hash inside the backend container
# so a wrong/stale bcrypt string in SQL cannot leave DX accounts unusable.
echo "Refreshing password_hash for DX (+ seed student) emails via backend bcrypt..."
HASH=""
if docker compose ps --status running backend 2>/dev/null | grep -q . \
  || [[ "$(docker inspect -f '{{.State.Status}}' graduate-network-backend 2>/dev/null || echo missing)" == "running" ]]; then
  HASH="$(docker compose exec -T backend node -e \
    "require('bcrypt').hash('password123',10).then(h=>process.stdout.write(h))" 2>/dev/null || true)"
fi
# bcrypt hashes look like $2b$10$... — reject empty / garbage
if [[ -z "$HASH" || ! "$HASH" =~ ^\$2[aby]\$ ]]; then
  # Fallback: known-good hash verified against password123 (create-test-accounts.sql)
  HASH='$2b$10$AknqEf4ZBF0oo6hG5cfSZu1xgs4kzgdnhO/HXxMMGZGxeMGIi0WjG'
  echo "  (backend bcrypt unavailable — using verified static hash)"
else
  echo "  (hash from backend bcrypt)"
fi

# Expand HASH once via -c double quotes (value is not re-parsed for $2 / $10).
docker compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
  -c "UPDATE users SET password_hash = '${HASH}', is_active = true, updated_at = CURRENT_TIMESTAMP WHERE email IN ('student@jjob.com','graduate@jjob.com','teacher@jjob.com','company@jjob.com','admin@jjob.com','choi.seungmin@example.com');"
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

# Curl through nginx when frontend is up (catches 401 hash / 404 proxy bugs early)
PORT="${FRONTEND_PORT:-8090}"
if curl -sS -o /dev/null --connect-timeout 2 --max-time 5 "http://127.0.0.1:${PORT}/api/health" 2>/dev/null; then
  chmod +x "$ROOT/scripts/verify-login.sh" 2>/dev/null || true
  echo "Verifying login via nginx (127.0.0.1:${PORT})..."
  BASE_URL="http://127.0.0.1:${PORT}" "$ROOT/scripts/verify-login.sh"
else
  echo "WARN: nginx not reachable on :${PORT} — skipped curl verify."
  echo "  Later: BASE_URL=http://127.0.0.1:${PORT} ./scripts/verify-login.sh"
fi

echo "Done. Try student@jjob.com / password123 on /login.html"
echo "  ./scripts/verify-login.sh"
echo "  curl -sS -X POST http://127.0.0.1:\${FRONTEND_PORT:-8090}/api/auth/login \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"email\":\"student@jjob.com\",\"password\":\"password123\"}'"
