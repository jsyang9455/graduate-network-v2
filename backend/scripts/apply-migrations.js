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

async function applyPendingMigrations({ endPool = false } = {}) {
  const migrationsDir = resolveMigrationsDir();
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

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

module.exports = { applyPendingMigrations };
