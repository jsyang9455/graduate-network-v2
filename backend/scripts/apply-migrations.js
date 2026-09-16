const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

/**
 * Resolve migrations directory for both host and Docker.
 * Compose mounts host `./database` at `/database` (see docker-compose.yml).
 * Local/dev: repo `database/migrations` relative to backend/.
 */
function resolveMigrationsDir() {
  const candidates = [
    process.env.MIGRATIONS_DIR,
    '/database/migrations',
    path.join(__dirname, '..', '..', 'database', 'migrations'),
    path.join(__dirname, '..', 'database', 'migrations'),
  ].filter(Boolean);

  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  throw new Error(
    `Migrations directory not found. Tried: ${candidates.join(', ')}. ` +
      'Mount ./database at /database (compose) or set MIGRATIONS_DIR.'
  );
}

/** Postgres codes that mean "schema already matches" (e.g. initdb ran 010). */
const IDEMPOTENT_PG_CODES = new Set([
  '42P07', // duplicate_table
  '42710', // duplicate_object
  '42701', // duplicate_column
  '42723', // duplicate_function
  '42P16', // invalid_table_definition (rarely from IF NOT EXISTS races)
  '23505', // unique_violation on seed inserts
]);

function isIdempotentSchemaError(err) {
  if (!err) return false;
  if (err.code && IDEMPOTENT_PG_CODES.has(err.code)) return true;
  const msg = String(err.message || '').toLowerCase();
  return (
    msg.includes('already exists') ||
    msg.includes('duplicate key') ||
    msg.includes('multiple primary keys')
  );
}

/**
 * Wait until Postgres accepts connections (cold EC2 / first boot).
 */
async function waitForDatabase({
  attempts = 30,
  delayMs = 2000,
} = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
      } finally {
        client.release();
      }
      if (i > 1) {
        console.log(`✅ Database ready after ${i} attempt(s)`);
      }
      return;
    } catch (err) {
      lastErr = err;
      console.warn(
        `⏳ Database not ready (${i}/${attempts}): ${err.message}`
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr || new Error('Database connection timed out');
}

async function applyPendingMigrations({ endPool = false } = {}) {
  const migrationsDir = resolveMigrationsDir();
  await waitForDatabase();
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Initdb may have run 010 without recording it — avoid re-apply churn.
    const schools = await client.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'schools'
      LIMIT 1
    `);
    if (schools.rows.length > 0) {
      await client.query(`
        INSERT INTO schema_migrations (filename) VALUES ($1)
        ON CONFLICT (filename) DO NOTHING
      `, ['010_v2_multischool.sql']);
    }

    const files = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const applied = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [file]
      );
      if (applied.rows.length > 0) {
        console.log(`⏭️  Skip migration ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`🚀 Applying migration ${file}...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`✅ Applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        if (isIdempotentSchemaError(err)) {
          console.warn(
            `⚠️  Migration ${file} reported already-applied schema (${err.code || 'n/a'}): ${err.message}`
          );
          await client.query(
            'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
            [file]
          );
          console.log(`✅ Marked ${file} as applied (idempotent skip)`);
          continue;
        }
        throw err;
      }
    }
  } finally {
    client.release();
    if (endPool) {
      await pool.end();
    }
  }
}

module.exports = {
  applyPendingMigrations,
  waitForDatabase,
  resolveMigrationsDir,
  isIdempotentSchemaError,
};
