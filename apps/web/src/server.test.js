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
    const payload = await response.json();
    assert.equal(payload.error.code, 'VALIDATION_ERROR');
  });
});
