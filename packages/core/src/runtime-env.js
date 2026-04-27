const ALLOWED_NODE_ENVS = new Set(['development', 'staging', 'production', 'test']);
const ALLOWED_PERSISTENCE_MODES = new Set(['memory', 'postgres']);
const ALLOWED_LOG_FORMATS = new Set(['pretty', 'json']);

function isBlank(value) {
  return typeof value !== 'string' || value.trim().length === 0;
}

function normalizeNodeEnv(rawValue) {
  return rawValue ?? 'development';
}

function normalizePersistenceMode(rawValue) {
  return rawValue ?? 'memory';
}

function parsePort(rawValue) {
  const value = rawValue ?? '3000';
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535 (received: ${value})`);
  }

  return parsed;
}

function parseHost(rawValue, nodeEnv) {
  if (typeof rawValue === 'string' && rawValue.trim().length > 0) {
    return rawValue.trim();
  }

  if (nodeEnv === 'production' || nodeEnv === 'staging') {
    return '0.0.0.0';
  }

  return '127.0.0.1';
}

function validateRuntimeEnv(env = process.env) {
  const errors = [];

  const nodeEnv = normalizeNodeEnv(env.NODE_ENV);
  const persistenceMode = normalizePersistenceMode(env.EDUCLINK_PERSISTENCE);
  const logFormat = env.LOG_FORMAT ?? (nodeEnv === 'production' ? 'json' : 'pretty');

  if (!ALLOWED_NODE_ENVS.has(nodeEnv)) {
    errors.push(`NODE_ENV must be one of: ${Array.from(ALLOWED_NODE_ENVS).join(', ')} (received: ${nodeEnv})`);
  }

  if (!ALLOWED_PERSISTENCE_MODES.has(persistenceMode)) {
    errors.push(`EDUCLINK_PERSISTENCE must be one of: ${Array.from(ALLOWED_PERSISTENCE_MODES).join(', ')} (received: ${persistenceMode})`);
  }

  if (!ALLOWED_LOG_FORMATS.has(logFormat)) {
    errors.push(`LOG_FORMAT must be one of: ${Array.from(ALLOWED_LOG_FORMATS).join(', ')} (received: ${logFormat})`);
  }

  let port = 3000;
  try {
    port = parsePort(env.PORT);
  } catch (error) {
    errors.push(error.message);
  }

  const databaseUrl = env.DATABASE_URL ?? '';
  const host = parseHost(env.HOST, nodeEnv);
  if (persistenceMode === 'postgres' && isBlank(databaseUrl)) {
    errors.push('DATABASE_URL is required when EDUCLINK_PERSISTENCE=postgres');
  }

  if ((nodeEnv === 'staging' || nodeEnv === 'production') && persistenceMode !== 'postgres') {
    errors.push(`EDUCLINK_PERSISTENCE=postgres is required when NODE_ENV=${nodeEnv}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    config: {
      nodeEnv,
      host,
      port,
      persistenceMode,
      databaseUrl,
      logFormat,
      logLevel: env.LOG_LEVEL ?? 'info'
    }
  };
}

function loadRuntimeEnv(env = process.env) {
  const result = validateRuntimeEnv(env);
  if (!result.ok) {
    throw new Error(`Invalid runtime configuration:\n- ${result.errors.join('\n- ')}`);
  }

  return result.config;
}

module.exports = {
  validateRuntimeEnv,
  loadRuntimeEnv,
  parsePort,
  parseHost
};
