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
