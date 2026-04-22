const fs = require('node:fs/promises');
const path = require('node:path');

const { getPool, closePool } = require('./client');

async function ensureMigrationTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedVersions(pool) {
  const result = await pool.query('SELECT version FROM schema_migrations');
  return new Set(result.rows.map((row) => row.version));
}

async function runMigrations() {
  const pool = getPool();
  const migrationDir = path.resolve(__dirname, '../migrations');
  const migrationFiles = (await fs.readdir(migrationDir)).filter((file) => file.endsWith('.sql')).sort();

  await ensureMigrationTable(pool);
  const appliedVersions = await getAppliedVersions(pool);

  for (const fileName of migrationFiles) {
    if (appliedVersions.has(fileName)) {
      continue;
    }

    const sql = await fs.readFile(path.join(migrationDir, fileName), 'utf8');
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations (version) VALUES ($1)', [fileName]);
      await pool.query('COMMIT');
      // eslint-disable-next-line no-console
      console.log(`Applied migration: ${fileName}`);
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }
}

runMigrations()
  .then(() => closePool())
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    await closePool();
    process.exitCode = 1;
  });
