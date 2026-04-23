const test = require('node:test');
const assert = require('node:assert/strict');

const { createServer } = require('./server');

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
test('postgres persistence: role access behavior on teacher endpoints', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: teacherCookie } = await login(baseUrl, 'teacher@school-a.test');
    const forbidden = await apiFetch(baseUrl, '/api/v1/teachers', { cookie: teacherCookie });
    assert.equal(forbidden.status, 403);
  });
});
