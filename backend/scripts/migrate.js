const fs = require('fs');
const path = require('path');
const { applyPendingMigrations } = require('./apply-migrations');

async function runMigration() {
  try {
    console.log('🚀 Starting database migrations...');

    const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema.sql');
    if (process.env.MIGRATE_SCHEMA === '1' && fs.existsSync(schemaPath)) {
      const { pool } = require('../config/database');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(schema);
      console.log('✅ Base schema applied (MIGRATE_SCHEMA=1)');
    }

    await applyPendingMigrations({ endPool: true });
    console.log('✅ Database migrations completed!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('🎉 Migration completed!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration error:', err);
      process.exit(1);
    });
}

module.exports = runMigration;
