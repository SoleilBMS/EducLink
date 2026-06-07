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

function collectSetCookies(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }
  const raw = response.headers.get('set-cookie');
  return raw ? [raw] : [];
}

function combineCookies(setCookies) {
  return setCookies.map((raw) => raw.split(';')[0]).filter(Boolean).join('; ');
}

function extractCsrfFromCookieString(cookieString) {
  if (!cookieString) return '';
  const match = cookieString.match(/(?:^|;\s*)csrf=([^;]+)/);
  return match ? match[1] : '';
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
    cookie: combineCookies(collectSetCookies(response))
  };
}

async function apiFetch(baseUrl, path, { cookie, method = 'GET', body } = {}) {
  const csrfToken = extractCsrfFromCookieString(cookie);
  const isMutation = method !== 'GET' && method !== 'HEAD';
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(isMutation && csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

async function postForm(baseUrl, path, { cookie, fields }) {
  const csrfToken = extractCsrfFromCookieString(cookie);
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: csrfToken, ...fields }).toString(),
    redirect: 'manual'
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

test(
  'postgres persistence: USR-01 admin crée un enseignant qui peut se logger',
  { skip: !process.env.DATABASE_URL },
  async () => {
    await withPostgresEnv(async () => {
      await withServer(async (baseUrl) => {
        const { cookie } = await login(baseUrl, 'admin@school-a.test');
        const uniqueSuffix = `${process.pid}-${Date.now()}`;
        const newEmail = `pg.usr01.${uniqueSuffix}@school-a.test`;

        const created = await postForm(baseUrl, '/admin/teachers', {
          cookie,
          fields: {
            firstName: 'Postgres',
            lastName: 'Prof',
            email: newEmail,
            password: 'PgPassword1!'
          }
        });
        assert.equal(created.status, 302);
        assert.match(created.headers.get('location') || '', /^\/admin\/teachers\//);

        const loginResult = await login(baseUrl, newEmail, 'PgPassword1!');
        assert.equal(loginResult.response.status, 302);
        assert.equal(loginResult.response.headers.get('location'), '/dashboard/teacher');
      });
    });
  }
);

test(
  'postgres persistence: USR-04 désactiver un compte bloque le login',
  { skip: !process.env.DATABASE_URL },
  async () => {
    await withPostgresEnv(async () => {
      await withServer(async (baseUrl) => {
        const { cookie: adminCookie } = await login(baseUrl, 'admin@school-a.test');
        const uniqueSuffix = `${process.pid}-${Date.now()}`;
        const newEmail = `pg.usr04.${uniqueSuffix}@school-a.test`;

        const created = await postForm(baseUrl, '/admin/teachers', {
          cookie: adminCookie,
          fields: {
            firstName: 'Pg',
            lastName: 'ToDeactivate',
            email: newEmail,
            password: 'PgPassword1!'
          }
        });
        assert.equal(created.status, 302);
        const teacherId = (created.headers.get('location') || '').split('/').pop();
        assert.ok(teacherId);

        const ok = await login(baseUrl, newEmail, 'PgPassword1!');
        assert.equal(ok.response.status, 302);

        const deactivate = await postForm(baseUrl, `/admin/users/${teacherId}/deactivate`, { cookie: adminCookie, fields: {} });
        assert.equal(deactivate.status, 302);

        const blocked = await login(baseUrl, newEmail, 'PgPassword1!');
        assert.equal(blocked.response.status, 401);

        const activate = await postForm(baseUrl, `/admin/users/${teacherId}/activate`, { cookie: adminCookie, fields: {} });
        assert.equal(activate.status, 302);

        const restored = await login(baseUrl, newEmail, 'PgPassword1!');
        assert.equal(restored.response.status, 302);
      });
    });
  }
);
