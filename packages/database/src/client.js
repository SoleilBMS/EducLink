const { loadRuntimeEnv } = require('../../core/src/runtime-env');

let pool = null;

function getRuntimeConfig() {
  return loadRuntimeEnv(process.env);
}

function isPersistenceEnabled() {
  return getRuntimeConfig().persistenceMode === 'postgres';
}

function createPool(connectionString) {
  // Lazy import so memory mode keeps working even without installing postgres client locally.
  // eslint-disable-next-line global-require
  const { Pool } = require('pg');
  return new Pool({ connectionString });
}

function getPool() {
  if (!pool) {
    const config = getRuntimeConfig();
    if (!config.databaseUrl) {
      throw new Error('DATABASE_URL is required when using postgres persistence');
    }

    pool = createPool(config.databaseUrl);
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
