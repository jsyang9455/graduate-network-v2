#!/usr/bin/env bash
# Dev/test EC2 only — loads DX personas from TEST-ACCOUNTS.md (password123).
# Not run on compose init; safe to re-run (test-accounts.sql upserts/deletes DX emails).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-graduate_network}"
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a
  source .env
  set +a
  DB_USER="${DB_USER:-postgres}"
  DB_NAME="${DB_NAME:-graduate_network}"
fi
echo "Loading database/test-accounts.sql into ${DB_NAME} as ${DB_USER}..."
docker compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" < database/test-accounts.sql
echo "Done. Try student@jjob.com / password123 on /login.html"
