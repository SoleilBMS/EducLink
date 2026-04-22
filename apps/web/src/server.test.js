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

test('school_admin peut faire le CRUD principal sur academic-years', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');

    const createResponse = await apiFetch(baseUrl, '/api/v1/academic-years', {
      cookie,
      method: 'POST',
      body: {
        label: '2026/2027',
        startsAt: '2026-09-01',
        endsAt: '2027-06-30',
        status: 'draft'
      }
    });

    assert.equal(createResponse.status, 201);
    const createdPayload = await createResponse.json();
    const createdId = createdPayload.data.id;
    assert.equal(createdPayload.data.tenant_id, 'school-a');

    const updateResponse = await apiFetch(baseUrl, `/api/v1/academic-years/${createdId}`, {
      cookie,
      method: 'PUT',
      body: {
        label: '2026/2027 - Updated',
        startsAt: '2026-09-01',
        endsAt: '2027-06-30',
        status: 'active'
      }
    });

    assert.equal(updateResponse.status, 200);
    const updatedPayload = await updateResponse.json();
    assert.equal(updatedPayload.data.label, '2026/2027 - Updated');

    const deleteResponse = await apiFetch(baseUrl, `/api/v1/academic-years/${createdId}`, {
      cookie,
      method: 'DELETE',
      body: {}
    });

    assert.equal(deleteResponse.status, 204);
  });
});

test('director peut consulter mais ne peut pas créer', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'director@school-a.test');

    const listResponse = await apiFetch(baseUrl, '/api/v1/grade-levels', { cookie });
    assert.equal(listResponse.status, 200);

    const createResponse = await apiFetch(baseUrl, '/api/v1/grade-levels', {
      cookie,
      method: 'POST',
      body: {
        name: '2ème année',
        order: 2
      }
    });

    assert.equal(createResponse.status, 403);
    const payload = await createResponse.json();
    assert.equal(payload.error.code, 'FORBIDDEN');
  });
});

test('isolation tenant stricte sur classes, niveaux et matières', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: adminACookie } = await login(baseUrl, 'admin@school-a.test');
    const { cookie: adminBCookie } = await login(baseUrl, 'admin@school-b.test');

    const gradeCreate = await apiFetch(baseUrl, '/api/v1/grade-levels', {
      cookie: adminACookie,
      method: 'POST',
      body: { name: 'Terminale', order: 12 }
    });
    const gradePayload = await gradeCreate.json();
    const gradeId = gradePayload.data.id;

    const classCreate = await apiFetch(baseUrl, '/api/v1/class-rooms', {
      cookie: adminACookie,
      method: 'POST',
      body: { name: 'T1', gradeLevelId: gradeId, capacity: 28 }
    });
    assert.equal(classCreate.status, 201);

    const subjectCreate = await apiFetch(baseUrl, '/api/v1/subjects', {
      cookie: adminACookie,
      method: 'POST',
      body: { name: 'Physique', code: 'PHY' }
    });
    assert.equal(subjectCreate.status, 201);

    const classListB = await apiFetch(baseUrl, '/api/v1/class-rooms', { cookie: adminBCookie });
    const classListPayloadB = await classListB.json();
    assert.ok(classListPayloadB.data.every((classRoom) => classRoom.tenant_id === 'school-b'));

    const subjectListB = await apiFetch(baseUrl, '/api/v1/subjects', { cookie: adminBCookie });
    const subjectListPayloadB = await subjectListB.json();
    assert.ok(subjectListPayloadB.data.every((subject) => subject.tenant_id === 'school-b'));

    const crossTenantRead = await apiFetch(baseUrl, `/api/v1/grade-levels/${gradeId}`, {
      cookie: adminBCookie
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

    assert.equal(crossTenantRead.status, 404);
  });
});

test('validation d entrée: term doit référencer une academic year du même tenant', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');

    const response = await apiFetch(baseUrl, '/api/v1/terms', {
      cookie,
      method: 'POST',
      body: {
        name: 'Trimester invalid',
        academicYearId: 'ay-b-2025',
        startsAt: '2025-09-01',
        endsAt: '2025-12-01'
      }
    });

    assert.equal(response.status, 400);
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
    assert.equal(payload.error.code, 'VALIDATION_ERROR');
  });
});
