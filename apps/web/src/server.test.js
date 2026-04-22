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

test('GET /dashboard redirige un utilisateur non authentifié vers /login', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/dashboard`, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/login');
  });
});

test('POST /login puis GET /dashboard autorise et expose role/tenant dans la session', async () => {
  await withServer(async (baseUrl) => {
    const { response: loginResponse, cookie } = await login(baseUrl, 'admin@school-a.test');
    assert.equal(loginResponse.status, 302);
    assert.ok(cookie);

    const dashboardResponse = await fetch(`${baseUrl}/dashboard`, { headers: { cookie } });
    assert.equal(dashboardResponse.status, 200);
    const html = await dashboardResponse.text();
    assert.match(html, /role: school_admin/);
    assert.match(html, /tenantId: school-a/);
  });
});

test('school_admin peut créer et modifier une année scolaire via API CRUD', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');

    const createResponse = await fetch(`${baseUrl}/api/v1/school-structure/academic_year`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: '2026-2027',
        school_id: 'school-a',
        start_date: '2026-09-01',
        end_date: '2027-06-30',
        is_current: false
      })
    });

    assert.equal(createResponse.status, 201);
    const createdPayload = await createResponse.json();
    assert.equal(createdPayload.data.name, '2026-2027');

    const updateResponse = await fetch(
      `${baseUrl}/api/v1/school-structure/academic_year/${createdPayload.data.id}`,
      {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ name: '2026/2027' })
      }
    );

    assert.equal(updateResponse.status, 200);
    const updatedPayload = await updateResponse.json();
    assert.equal(updatedPayload.data.name, '2026/2027');
  });
});

test('school_admin peut créer niveaux, classes et matières', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');

    const gradeResponse = await fetch(`${baseUrl}/api/v1/school-structure/grade_level`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ name: '5ème', school_id: 'school-a', order_index: 2 })
    });
    assert.equal(gradeResponse.status, 201);
    const gradePayload = await gradeResponse.json();

    const classResponse = await fetch(`${baseUrl}/api/v1/school-structure/class_room`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: '5A',
        school_id: 'school-a',
        grade_level_id: gradePayload.data.id,
        capacity: 28
      })
    });
    assert.equal(classResponse.status, 201);

    const subjectResponse = await fetch(`${baseUrl}/api/v1/school-structure/subject`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Sciences', code: 'SCI', school_id: 'school-a' })
    });
    assert.equal(subjectResponse.status, 201);
  });
});

test('scoping tenant strict: accès cross-tenant refusé', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');

    const listResponse = await fetch(`${baseUrl}/api/v1/school-structure/school`, {
      headers: { cookie }
    });
    const listPayload = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.equal(listPayload.data.length, 1);
    assert.equal(listPayload.data[0].tenant_id, 'school-a');

    const forbiddenUpdate = await fetch(`${baseUrl}/api/v1/school-structure/school/school-b`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'intrusion' })
    });

    assert.equal(forbiddenUpdate.status, 404);
  });
});

test('director autorisé sur module school structure, teacher interdit', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: directorCookie } = await login(baseUrl, 'director@school-a.test');
    const okResponse = await fetch(`${baseUrl}/api/v1/school-structure/subject`, {
      headers: { cookie: directorCookie }
    });
    assert.equal(okResponse.status, 200);

    const { cookie: teacherCookie } = await login(baseUrl, 'teacher@school-a.test');
    const forbiddenResponse = await fetch(`${baseUrl}/api/v1/school-structure/subject`, {
      headers: { cookie: teacherCookie }
    });
    assert.equal(forbiddenResponse.status, 403);
  });
});

test('UI admin school structure est accessible à school_admin', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/admin/school-structure`, {
      headers: { cookie }
    });

    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Administration structure école/);
    assert.match(html, /Années scolaires/);
    assert.match(html, /Niveaux/);
    assert.match(html, /Classes/);
    assert.match(html, /Matières/);
  });
});

test('API protégée renvoie UNAUTHORIZED si non authentifié', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/classes`);
    assert.equal(response.status, 401);
    const payload = await response.json();
    assert.equal(payload.error.code, 'UNAUTHORIZED');
  });
});
