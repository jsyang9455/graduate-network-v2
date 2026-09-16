#!/usr/bin/env bash
# Load rich DX persona demo data (idempotent).
# 1) Ensures DX accounts (database/test-accounts.sql) via load-test-accounts.sh when available
# 2) Applies database/demo-seed.sql (resumes, posts, jobs, announcements,
#    education programs, field trips, counseling sessions/journals, school branding)
#
# Usage (AWS / docker compose):
#   ./scripts/load-demo-data.sh
#
# Local without docker (node + pg, DB on localhost:5432):
#   DB_PASSWORD=postgres ./scripts/load-demo-data.sh
#
# Skip accounts step if already loaded:
#   SKIP_TEST_ACCOUNTS=1 ./scripts/load-demo-data.sh
#
# Optional smoke after load:
#   VERIFY=1 BASE_URL=http://127.0.0.1:5050 ./scripts/load-demo-data.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SEED_SQL="$ROOT/database/demo-seed.sql"
if [[ ! -f "$SEED_SQL" ]]; then
  echo "ERROR: $SEED_SQL not found" >&2
  exit 1
fi

DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-graduate_network}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
  DB_USER="${DB_USER:-postgres}"
  DB_NAME="${DB_NAME:-graduate_network}"
  DB_HOST="${DB_HOST:-127.0.0.1}"
  DB_PORT="${DB_PORT:-5432}"
fi
export DB_USER DB_NAME DB_HOST DB_PORT
export DB_PASSWORD="${DB_PASSWORD:-postgres}"

use_docker=0
if command -v docker >/dev/null 2>&1 && [[ -f "$ROOT/docker-compose.yml" ]]; then
  if docker compose ps --status running postgres 2>/dev/null | grep -q . \
    || [[ "$(docker inspect -f '{{.State.Status}}' graduate-network-db 2>/dev/null || echo missing)" == "running" ]]; then
    use_docker=1
  fi
fi

apply_sql_docker() {
  local file="$1"
  docker compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 < "$file"
}

apply_sql_node() {
  local file="$1"
  SQL_FILE="$file" node <<'NODE'
const fs = require('fs');
const path = require('path');
const { Client } = require(path.join(process.cwd(), 'backend/node_modules/pg'));
const file = process.env.SQL_FILE;
const client = new Client({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'graduate_network',
});
(async () => {
  const sql = fs.readFileSync(file, 'utf8');
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log('Applied', file);
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
NODE
}

echo "==> Ensuring DX test accounts..."
if [[ "${SKIP_TEST_ACCOUNTS:-0}" == "1" ]]; then
  echo "  (SKIP_TEST_ACCOUNTS=1)"
elif [[ -x "$ROOT/scripts/load-test-accounts.sh" ]] && [[ "$use_docker" -eq 1 ]]; then
  "$ROOT/scripts/load-test-accounts.sh" || {
    echo "WARN: load-test-accounts.sh failed — applying test-accounts.sql directly" >&2
    apply_sql_docker "$ROOT/database/test-accounts.sql"
  }
elif [[ -f "$ROOT/database/test-accounts.sql" ]]; then
  echo "  Applying database/test-accounts.sql via node/pg..."
  apply_sql_node "$ROOT/database/test-accounts.sql"
else
  echo "ERROR: cannot load test accounts" >&2
  exit 1
fi

echo "==> Applying database/demo-seed.sql..."
if [[ "$use_docker" -eq 1 ]]; then
  sql_ok=0
  for attempt in 1 2 3; do
    if apply_sql_docker "$SEED_SQL"; then
      sql_ok=1
      break
    fi
    echo "  … psql failed (attempt ${attempt}/3), retry in 2s"
    sleep 2
  done
  if [[ "$sql_ok" -ne 1 ]]; then
    echo "ERROR: demo-seed.sql failed via docker" >&2
    exit 1
  fi
else
  apply_sql_node "$SEED_SQL"
fi

# demo-seed.sql only inserts files metadata; local storage needs the SVG bytes
# so GET /api/schools/:id/logo does not 404 (ENOENT).
install_jjth_logo_bytes() {
  local src="$ROOT/images/school-logo-jjth.svg"
  local key="demo/school-logo-jjth.svg"
  local size
  if [[ ! -f "$src" ]]; then
    echo "WARN: $src missing — JJTH logo bytes not installed" >&2
    return 0
  fi
  size="$(wc -c < "$src" | tr -d '[:space:]')"
  echo "==> Installing JJTH school logo bytes (${size} B → ${key})"

  if [[ "$use_docker" -eq 1 ]]; then
    local backend_up=0
    if docker compose ps --status running backend 2>/dev/null | grep -q . \
      || [[ "$(docker inspect -f '{{.State.Status}}' graduate-network-backend 2>/dev/null || echo missing)" == "running" ]]; then
      backend_up=1
    fi
    if [[ "$backend_up" -eq 1 ]]; then
      docker compose exec -T backend mkdir -p /app/uploads/demo
      docker compose cp "$src" "backend:/app/uploads/${key}"
    else
      # Volume still exists when backend is stopped — copy via alpine helper
      local vol
      vol="$(docker volume ls -q --filter name=backend_uploads | head -1 || true)"
      if [[ -z "$vol" ]]; then
        echo "WARN: backend_uploads volume not found; start backend then re-run" >&2
        return 0
      fi
      docker run --rm \
        -v "${vol}:/uploads" \
        -v "${src}:/src/school-logo-jjth.svg:ro" \
        alpine:3.20 \
        sh -c "mkdir -p /uploads/demo && cp /src/school-logo-jjth.svg /uploads/${key}"
    fi
    docker compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
      -c "UPDATE files SET size = ${size}, mime = 'image/svg+xml' WHERE bucket_key = '${key}' AND kind = 'school_logo';"
  else
    local dest_root="${STORAGE_LOCAL_DIR:-$ROOT/backend/uploads}"
    mkdir -p "${dest_root}/demo"
    cp "$src" "${dest_root}/${key}"
    SIZE="$size" KEY="$key" node <<'NODE'
const path = require('path');
const { Client } = require(path.join(process.cwd(), 'backend/node_modules/pg'));
const client = new Client({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'graduate_network',
});
(async () => {
  await client.connect();
  await client.query(
    `UPDATE files SET size = $1, mime = 'image/svg+xml'
     WHERE bucket_key = $2 AND kind = 'school_logo'`,
    [Number(process.env.SIZE), process.env.KEY]
  );
  await client.end();
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
NODE
  fi
}
install_jjth_logo_bytes

echo "==> Demo row counts ([DEMO] marker)"
count_sql="SELECT
  (SELECT COUNT(*) FROM resumes WHERE title LIKE '[DEMO]%') AS resumes,
  (SELECT COUNT(*) FROM posts WHERE title LIKE '[DEMO]%') AS posts,
  (SELECT COUNT(*) FROM jobs WHERE title LIKE '[DEMO]%') AS jobs,
  (SELECT COUNT(*) FROM announcements WHERE title LIKE '[DEMO]%') AS announcements,
  (SELECT COUNT(*) FROM field_trips WHERE title LIKE '[DEMO]%') AS field_trips,
  (SELECT COUNT(*) FROM education_programs WHERE title LIKE '[DEMO]%') AS edu_programs,
  (SELECT COUNT(*) FROM counseling_sessions WHERE topic LIKE '[DEMO]%') AS counseling_sessions,
  (SELECT COUNT(*) FROM counseling_journals WHERE title LIKE '[DEMO]%') AS counseling_journals,
  (SELECT COALESCE(is_counselor,false) FROM users WHERE email='teacher@jjob.com') AS teacher_is_counselor,
  (SELECT school_id IS NOT NULL FROM users WHERE email='student@jjob.com') AS student_has_school;"

if [[ "$use_docker" -eq 1 ]]; then
  docker compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -c "$count_sql"
else
  COUNT_SQL="$count_sql" node -e "
const {Client}=require('./backend/node_modules/pg');
const c=new Client({
  host: process.env.DB_HOST || '127.0.0.1',
  port: +(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'graduate_network',
});
c.connect()
  .then(() => c.query(process.env.COUNT_SQL))
  .then((r) => { console.table(r.rows); return c.end(); })
  .catch((e) => { console.error(e); process.exit(1); });
"
fi

if [[ "${VERIFY:-0}" == "1" ]]; then
  echo "==> Running scripts/verify-demo-data.cjs ..."
  BASE_URL="${BASE_URL:-http://127.0.0.1:${FRONTEND_PORT:-8090}}" \
    node "$ROOT/scripts/verify-demo-data.cjs"
fi

echo "Done. Load with: ./scripts/load-demo-data.sh"
echo "  Smoke: BASE_URL=http://127.0.0.1:5050 node scripts/verify-demo-data.cjs"
