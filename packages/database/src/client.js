let pool = null;

function getDatabaseUrl() {
  return process.env.DATABASE_URL ?? '';
}

function isPersistenceEnabled() {
  return process.env.EDUCLINK_PERSISTENCE === 'postgres';
}

function createPool(connectionString) {
  // Lazy import so memory mode keeps working even without installing postgres client locally.
  // eslint-disable-next-line global-require
  const { Pool } = require('pg');
  return new Pool({ connectionString });
}

function getPool() {
  if (!pool) {
    const connectionString = getDatabaseUrl();
    if (!connectionString) {
      throw new Error('DATABASE_URL is required when using postgres persistence');
    }

    pool = createPool(connectionString);
  }

  return pool;
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getPool,
  closePool,
  isPersistenceEnabled
};
