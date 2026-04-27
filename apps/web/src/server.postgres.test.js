const test = require('node:test');
const assert = require('node:assert/strict');

const { createServer } = require('./server');

function withPostgresEnv(run) {
  const previousEnv = {
    NODE_ENV: process.env.NODE_ENV,
    EDUCLINK_PERSISTENCE: process.env.EDUCLINK_PERSISTENCE,
    DATABASE_URL: process.env.DATABASE_URL
  };

  process.env.NODE_ENV = 'test';
  process.env.EDUCLINK_PERSISTENCE = 'postgres';

  return Promise.resolve()
    .then(run)
    .finally(() => {
      if (previousEnv.NODE_ENV === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousEnv.NODE_ENV;
      }

      if (previousEnv.EDUCLINK_PERSISTENCE === undefined) {
        delete process.env.EDUCLINK_PERSISTENCE;
      } else {
        process.env.EDUCLINK_PERSISTENCE = previousEnv.EDUCLINK_PERSISTENCE;
      }

      if (previousEnv.DATABASE_URL === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousEnv.DATABASE_URL;
      }
    });
}

async function withServer(run) {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function login(baseUrl, email, password = 'password123') {
  const response = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }).toString(),
    redirect: 'manual'
  });

  return {
    response,
    cookie: response.headers.get('set-cookie')?.split(';')[0]
  };
}

async function apiFetch(baseUrl, path, { cookie, method = 'GET', body } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

// NOTE: broader route/journey tests continue to run in default memory mode
// until fixture assumptions are explicitly migrated to Postgres fixtures.
test(
  'postgres persistence: role access behavior on teacher endpoints',
  { skip: !process.env.DATABASE_URL },
  async () => {
  await withPostgresEnv(async () => {
    await withServer(async (baseUrl) => {
      const healthResponse = await fetch(`${baseUrl}/healthz`);
      assert.equal(healthResponse.status, 200);
      const healthPayload = await healthResponse.json();
      assert.equal(healthPayload.persistence.mode, 'postgres');

      const { cookie: teacherCookie } = await login(baseUrl, 'teacher@school-a.test');
      const forbidden = await apiFetch(baseUrl, '/api/v1/teachers', { cookie: teacherCookie });
      assert.equal(forbidden.status, 403);
    });
  });
  }
);
