const test = require('node:test');
const assert = require('node:assert/strict');

const { validateRuntimeEnv, loadRuntimeEnv, parsePort } = require('./runtime-env');

test('parsePort utilise 3000 par défaut', () => {
  assert.equal(parsePort(undefined), 3000);
});

test('validateRuntimeEnv accepte la config par défaut', () => {
  const result = validateRuntimeEnv({});
  assert.equal(result.ok, true);
  assert.equal(result.config.persistenceMode, 'memory');
  assert.equal(result.config.nodeEnv, 'development');
});

test('validateRuntimeEnv rejette DATABASE_URL absent en mode postgres', () => {
  const result = validateRuntimeEnv({ EDUCLINK_PERSISTENCE: 'postgres' });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /DATABASE_URL is required/);
});

test('validateRuntimeEnv rejette les valeurs invalides', () => {
  const result = validateRuntimeEnv({ NODE_ENV: 'prod', EDUCLINK_PERSISTENCE: 'sqlite', LOG_FORMAT: 'text', PORT: 'abc' });
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 4);
});

test('validateRuntimeEnv rejette memory en staging/production', () => {
  const stagingResult = validateRuntimeEnv({ NODE_ENV: 'staging', EDUCLINK_PERSISTENCE: 'memory' });
  assert.equal(stagingResult.ok, false);
  assert.match(stagingResult.errors.join(' '), /EDUCLINK_PERSISTENCE=postgres is required when NODE_ENV=staging/);

  const productionResult = validateRuntimeEnv({ NODE_ENV: 'production', EDUCLINK_PERSISTENCE: 'memory' });
  assert.equal(productionResult.ok, false);
  assert.match(productionResult.errors.join(' '), /EDUCLINK_PERSISTENCE=postgres is required when NODE_ENV=production/);
});

test('loadRuntimeEnv retourne une config normalisée', () => {
  const config = loadRuntimeEnv({ NODE_ENV: 'staging', PORT: '4100', EDUCLINK_PERSISTENCE: 'postgres', DATABASE_URL: 'postgres://example' });
  assert.equal(config.nodeEnv, 'staging');
  assert.equal(config.port, 4100);
  assert.equal(config.persistenceMode, 'postgres');
});

test('loadRuntimeEnv lève une erreur explicite en cas de config invalide', () => {
  assert.throws(
    () => loadRuntimeEnv({ PORT: '-1' }),
    /Invalid runtime configuration/
  );
});
