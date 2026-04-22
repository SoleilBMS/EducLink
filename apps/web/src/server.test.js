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

test('school_admin peut créer un élève', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');

    const response = await apiFetch(baseUrl, '/api/v1/students', {
      cookie,
      method: 'POST',
      body: {
        firstName: 'Nina',
        lastName: 'Bensalem',
        admissionNumber: 'A-145',
        classRoomId: 'class-a1',
        dateOfBirth: '2014-01-13'
      }
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.data.tenant_id, 'school-a');
    assert.equal(payload.data.classRoomId, 'class-a1');
  });
});

test('school_admin peut modifier un élève', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');

    const createResponse = await apiFetch(baseUrl, '/api/v1/students', {
      cookie,
      method: 'POST',
      body: {
        firstName: 'Yasmin',
        lastName: 'Karim',
        admissionNumber: 'A-241',
        classRoomId: 'class-a1',
        dateOfBirth: '2013-07-01'
      }
    });
    const createdPayload = await createResponse.json();

    const updateResponse = await apiFetch(baseUrl, `/api/v1/students/${createdPayload.data.id}`, {
      cookie,
      method: 'PUT',
      body: {
        firstName: 'Yasmin',
        lastName: 'Karim',
        admissionNumber: 'A-241-UPDATED',
        classRoomId: 'class-a2',
        dateOfBirth: '2013-07-01'
      }
    });

    assert.equal(updateResponse.status, 200);
    const updatedPayload = await updateResponse.json();
    assert.equal(updatedPayload.data.admissionNumber, 'A-241-UPDATED');
    assert.equal(updatedPayload.data.classRoomId, 'class-a2');
  });
});

test('school_admin peut archiver logiquement un élève', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');

    const createResponse = await apiFetch(baseUrl, '/api/v1/students', {
      cookie,
      method: 'POST',
      body: {
        firstName: 'Samir',
        lastName: 'Yahia',
        admissionNumber: 'A-323',
        classRoomId: 'class-a1',
        dateOfBirth: '2012-04-04'
      }
    });
    const createdPayload = await createResponse.json();

    const archiveResponse = await apiFetch(baseUrl, `/api/v1/students/${createdPayload.data.id}`, {
      cookie,
      method: 'DELETE'
    });

    assert.equal(archiveResponse.status, 200);
    const archivedPayload = await archiveResponse.json();
    assert.ok(archivedPayload.data.archived_at);

    const listResponse = await apiFetch(baseUrl, '/api/v1/students', { cookie });
    const listPayload = await listResponse.json();
    assert.ok(listPayload.data.every((student) => student.id !== createdPayload.data.id));
  });
});

test('liste élèves supporte filtre par classe', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');

    await apiFetch(baseUrl, '/api/v1/students', {
      cookie,
      method: 'POST',
      body: {
        firstName: 'Amel',
        lastName: 'Nouri',
        admissionNumber: 'A-555',
        classRoomId: 'class-a2',
        dateOfBirth: '2013-05-17'
      }
    });

    const filteredResponse = await apiFetch(baseUrl, '/api/v1/students?classRoomId=class-a2', { cookie });
    assert.equal(filteredResponse.status, 200);
    const filteredPayload = await filteredResponse.json();
    assert.ok(filteredPayload.data.length >= 1);
    assert.ok(filteredPayload.data.every((student) => student.classRoomId === 'class-a2'));
  });
});

test('isolation tenant stricte pour les élèves', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: adminACookie } = await login(baseUrl, 'admin@school-a.test');
    const { cookie: adminBCookie } = await login(baseUrl, 'admin@school-b.test');

    const createResponse = await apiFetch(baseUrl, '/api/v1/students', {
      cookie: adminACookie,
      method: 'POST',
      body: {
        firstName: 'Meriem',
        lastName: 'Hakim',
        admissionNumber: 'A-888',
        classRoomId: 'class-a1',
        dateOfBirth: '2013-11-19'
      }
    });

    const createdPayload = await createResponse.json();

    const crossTenantRead = await apiFetch(baseUrl, `/api/v1/students/${createdPayload.data.id}`, {
      cookie: adminBCookie
    });

    assert.equal(crossTenantRead.status, 404);

    const tenantBList = await apiFetch(baseUrl, '/api/v1/students', { cookie: adminBCookie });
    const tenantBPayload = await tenantBList.json();
    assert.ok(tenantBPayload.data.every((student) => student.tenant_id === 'school-b'));
  });
});

test('accès refusé proprement si rôle non autorisé en écriture', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'director@school-a.test');

    const createResponse = await apiFetch(baseUrl, '/api/v1/students', {
      cookie,
      method: 'POST',
      body: {
        firstName: 'Nope',
        lastName: 'Denied',
        admissionNumber: 'A-999',
        classRoomId: 'class-a1',
        dateOfBirth: '2013-02-20'
      }
    });

    assert.equal(createResponse.status, 403);
    const payload = await createResponse.json();
    assert.equal(payload.error.code, 'FORBIDDEN');
  });
});

test('school_admin peut créer un parent', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await apiFetch(baseUrl, '/api/v1/parents', {
      cookie,
      method: 'POST',
      body: {
        firstName: 'Salma',
        lastName: 'Mourad',
        phone: '+1 555-0100',
        email: 'salma.parent@test.local',
        address: '12 Main Street',
        notes: 'Prefers SMS'
      }
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.data.tenant_id, 'school-a');
    assert.equal(payload.data.firstName, 'Salma');
  });
});

test('school_admin peut lier un parent à plusieurs élèves', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const createParentResponse = await apiFetch(baseUrl, '/api/v1/parents', {
      cookie,
      method: 'POST',
      body: { firstName: 'Rami', lastName: 'Tarek', email: 'rami@test.local' }
    });
    const parentPayload = await createParentResponse.json();

    const createStudentOne = await apiFetch(baseUrl, '/api/v1/students', {
      cookie,
      method: 'POST',
      body: {
        firstName: 'Child',
        lastName: 'One',
        admissionNumber: 'A-411',
        classRoomId: 'class-a1',
        dateOfBirth: '2013-01-01'
      }
    });
    const studentOnePayload = await createStudentOne.json();

    const createStudentTwo = await apiFetch(baseUrl, '/api/v1/students', {
      cookie,
      method: 'POST',
      body: {
        firstName: 'Child',
        lastName: 'Two',
        admissionNumber: 'A-412',
        classRoomId: 'class-a2',
        dateOfBirth: '2014-01-01'
      }
    });
    const studentTwoPayload = await createStudentTwo.json();

    const linkResponse = await apiFetch(baseUrl, `/api/v1/parents/${parentPayload.data.id}/links`, {
      cookie,
      method: 'POST',
      body: {
        studentIds: [studentOnePayload.data.id, studentTwoPayload.data.id],
        relationship: 'guardian',
        isPrimaryContact: true
      }
    });

    assert.equal(linkResponse.status, 201);
    const linkPayload = await linkResponse.json();
    assert.equal(linkPayload.data.length, 2);

    const parentDetails = await apiFetch(baseUrl, `/api/v1/parents/${parentPayload.data.id}`, { cookie });
    const parentDetailsPayload = await parentDetails.json();
    assert.equal(parentDetailsPayload.data.links.length, 2);
  });
});

test('liaison parent-élèves est atomique quand un studentId est invalide', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const createParentResponse = await apiFetch(baseUrl, '/api/v1/parents', {
      cookie,
      method: 'POST',
      body: { firstName: 'Atomic', lastName: 'Parent', email: 'atomic@test.local' }
    });
    const parentPayload = await createParentResponse.json();

    const createStudent = await apiFetch(baseUrl, '/api/v1/students', {
      cookie,
      method: 'POST',
      body: {
        firstName: 'Valid',
        lastName: 'Student',
        admissionNumber: 'A-999',
        classRoomId: 'class-a1',
        dateOfBirth: '2012-02-02'
      }
    });
    const studentPayload = await createStudent.json();

    const linkResponse = await apiFetch(baseUrl, `/api/v1/parents/${parentPayload.data.id}/links`, {
      cookie,
      method: 'POST',
      body: {
        studentIds: [studentPayload.data.id, 'student-does-not-exist'],
        relationship: 'guardian'
      }
    });
    assert.equal(linkResponse.status, 422);

    const parentDetails = await apiFetch(baseUrl, `/api/v1/parents/${parentPayload.data.id}`, { cookie });
    const parentDetailsPayload = await parentDetails.json();
    assert.equal(parentDetailsPayload.data.links.length, 0);
  });
});

test('school_admin peut lier plusieurs responsables à un élève', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const createStudent = await apiFetch(baseUrl, '/api/v1/students', {
      cookie,
      method: 'POST',
      body: {
        firstName: 'Multi',
        lastName: 'Responsible',
        admissionNumber: 'A-510',
        classRoomId: 'class-a1',
        dateOfBirth: '2013-06-06'
      }
    });
    const studentPayload = await createStudent.json();

    const parentOne = await apiFetch(baseUrl, '/api/v1/parents', {
      cookie,
      method: 'POST',
      body: { firstName: 'Parent', lastName: 'One', email: 'parent1@test.local' }
    });
    const parentOnePayload = await parentOne.json();

    const parentTwo = await apiFetch(baseUrl, '/api/v1/parents', {
      cookie,
      method: 'POST',
      body: { firstName: 'Parent', lastName: 'Two', email: 'parent2@test.local' }
    });
    const parentTwoPayload = await parentTwo.json();

    await apiFetch(baseUrl, `/api/v1/parents/${parentOnePayload.data.id}/links`, {
      cookie,
      method: 'POST',
      body: { studentIds: [studentPayload.data.id], relationship: 'mother' }
    });
    await apiFetch(baseUrl, `/api/v1/parents/${parentTwoPayload.data.id}/links`, {
      cookie,
      method: 'POST',
      body: { studentIds: [studentPayload.data.id], relationship: 'father' }
    });

    const studentParentsResponse = await apiFetch(baseUrl, `/api/v1/students/${studentPayload.data.id}/parents`, { cookie });
    assert.equal(studentParentsResponse.status, 200);
    const studentParentsPayload = await studentParentsResponse.json();
    assert.equal(studentParentsPayload.data.length, 2);
  });
});

test('isolation tenant stricte pour parents et liens', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: adminACookie } = await login(baseUrl, 'admin@school-a.test');
    const { cookie: adminBCookie } = await login(baseUrl, 'admin@school-b.test');

    const createParentResponse = await apiFetch(baseUrl, '/api/v1/parents', {
      cookie: adminACookie,
      method: 'POST',
      body: { firstName: 'Tenant', lastName: 'Scoped', email: 'tenant.a@test.local' }
    });
    const parentPayload = await createParentResponse.json();

    const crossTenantRead = await apiFetch(baseUrl, `/api/v1/parents/${parentPayload.data.id}`, {
      cookie: adminBCookie
    });
    assert.equal(crossTenantRead.status, 404);

    const tenantBListResponse = await apiFetch(baseUrl, '/api/v1/parents', { cookie: adminBCookie });
    const tenantBPayload = await tenantBListResponse.json();
    assert.ok(tenantBPayload.data.every((parent) => parent.tenant_id === 'school-b'));
  });
});

test('accès parent refusé si rôle non autorisé', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'director@school-a.test');
    const response = await apiFetch(baseUrl, '/api/v1/parents', {
      cookie,
      method: 'POST',
      body: { firstName: 'Denied', lastName: 'Director', email: 'denied@test.local' }
    });

    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.error.code, 'FORBIDDEN');
  });
});
