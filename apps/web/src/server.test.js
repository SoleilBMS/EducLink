const test = require('node:test');
const assert = require('node:assert/strict');

const { createServer } = require('./server');

async function withServer(run) {
  const server = createServer();

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

test('GET /dashboard redirige un utilisateur non authentifié vers /login', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/dashboard`, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/login');
  });
});

test('POST /login puis GET /dashboard autorise et expose role/tenant dans la session', async () => {
  await withServer(async (baseUrl) => {
    const loginResponse = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        email: 'admin@school-a.test',
        password: 'password123'
      }).toString(),
      redirect: 'manual'
    });

    assert.equal(loginResponse.status, 302);
    assert.equal(loginResponse.headers.get('location'), '/dashboard');

    const setCookie = loginResponse.headers.get('set-cookie');
    assert.ok(setCookie);

    const dashboardResponse = await fetch(`${baseUrl}/dashboard`, {
      headers: {
        cookie: setCookie.split(';')[0]
      }
    });

    assert.equal(dashboardResponse.status, 200);
    const html = await dashboardResponse.text();
    assert.match(html, /userId: u-admin-a/);
    assert.match(html, /role: school_admin/);
    assert.match(html, /tenantId: school-a/);
  });
});

test('POST /logout invalide la session et reprotège /dashboard', async () => {
  await withServer(async (baseUrl) => {
    const loginResponse = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        email: 'admin@school-a.test',
        password: 'password123'
      }).toString(),
      redirect: 'manual'
    });

    const sessionCookie = loginResponse.headers.get('set-cookie').split(';')[0];

    const logoutResponse = await fetch(`${baseUrl}/logout`, {
      method: 'POST',
      headers: {
        cookie: sessionCookie
      },
      redirect: 'manual'
    });

    assert.equal(logoutResponse.status, 302);
    assert.equal(logoutResponse.headers.get('location'), '/login');

    const protectedResponse = await fetch(`${baseUrl}/dashboard`, {
      headers: {
        cookie: sessionCookie
      },
      redirect: 'manual'
    });

    assert.equal(protectedResponse.status, 302);
    assert.equal(protectedResponse.headers.get('location'), '/login');
  });
});
