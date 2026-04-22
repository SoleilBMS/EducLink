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

test('redirection après login vers dashboard adapté au rôle', async () => {
  await withServer(async (baseUrl) => {
    const adminLogin = await login(baseUrl, 'admin@school-a.test');
    const teacherLogin = await login(baseUrl, 'teacher@school-a.test');
    const parentLogin = await login(baseUrl, 'parent@school-a.test');

    assert.equal(adminLogin.response.status, 302);
    assert.equal(adminLogin.response.headers.get('location'), '/dashboard/admin');
    assert.equal(teacherLogin.response.headers.get('location'), '/dashboard/teacher');
    assert.equal(parentLogin.response.headers.get('location'), '/dashboard/parent');
  });
});

test('le contenu du dashboard diffère selon le rôle', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: adminCookie } = await login(baseUrl, 'admin@school-a.test');
    const { cookie: studentCookie } = await login(baseUrl, 'student@school-a.test');

    const adminResponse = await apiFetch(baseUrl, '/dashboard/admin', { cookie: adminCookie });
    const studentResponse = await apiFetch(baseUrl, '/dashboard/student', { cookie: studentCookie });

    assert.equal(adminResponse.status, 200);
    assert.equal(studentResponse.status, 200);

    const adminHtml = await adminResponse.text();
    const studentHtml = await studentResponse.text();
    assert.match(adminHtml, /Dashboard Admin/);
    assert.match(adminHtml, /Synthèse établissement/);
    assert.match(studentHtml, /Dashboard Student/);
    assert.match(studentHtml, /Mon espace/);
  });
});

test('accès interdit à un dashboard non autorisé', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await apiFetch(baseUrl, '/dashboard/admin', { cookie });

    assert.equal(response.status, 403);
  });
});

test('dashboard admin respecte l’isolation tenant sur les métriques', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-b.test');
    const response = await apiFetch(baseUrl, '/dashboard/admin', { cookie });

    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Classes actives: 1/);
    assert.match(html, /Élèves actifs: 1/);
    assert.match(html, /Responsables actifs: 0/);
    assert.match(html, /Enseignants actifs: 0/);
  });
});

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

test('school_admin peut créer un enseignant', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await apiFetch(baseUrl, '/api/v1/teachers', {
      cookie,
      method: 'POST',
      body: {
        firstName: 'Ines',
        lastName: 'Mansouri',
        email: 'ines.teacher@test.local',
        phone: '+1-555-0400',
        notes: 'Titulaire cycle primaire',
        classRoomIds: ['class-a1'],
        subjectIds: ['subject-a-math']
      }
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.data.tenant_id, 'school-a');
    assert.equal(payload.data.classRoomIds.length, 1);
    assert.equal(payload.data.subjectIds.length, 1);
  });
});

test('school_admin peut modifier un enseignant', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const createResponse = await apiFetch(baseUrl, '/api/v1/teachers', {
      cookie,
      method: 'POST',
      body: {
        firstName: 'Rachid',
        lastName: 'Amar',
        email: 'rachid.teacher@test.local',
        classRoomIds: ['class-a1'],
        subjectIds: ['subject-a-math']
      }
    });
    const createdPayload = await createResponse.json();

    const updateResponse = await apiFetch(baseUrl, `/api/v1/teachers/${createdPayload.data.id}`, {
      cookie,
      method: 'PUT',
      body: {
        firstName: 'Rachid',
        lastName: 'Amar',
        email: 'rachid.teacher.updated@test.local',
        phone: '+1-555-0401',
        notes: 'Updated profile',
        classRoomIds: ['class-a2'],
        subjectIds: ['subject-a-fr']
      }
    });

    assert.equal(updateResponse.status, 200);
    const updatedPayload = await updateResponse.json();
    assert.equal(updatedPayload.data.email, 'rachid.teacher.updated@test.local');
    assert.deepEqual(updatedPayload.data.classRoomIds, ['class-a2']);
    assert.deepEqual(updatedPayload.data.subjectIds, ['subject-a-fr']);
  });
});

test('school_admin peut affecter un enseignant à plusieurs classes', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const createResponse = await apiFetch(baseUrl, '/api/v1/teachers', {
      cookie,
      method: 'POST',
      body: {
        firstName: 'Mona',
        lastName: 'Halim',
        email: 'mona.teacher@test.local',
        classRoomIds: ['class-a1', 'class-a2'],
        subjectIds: ['subject-a-math']
      }
    });

    assert.equal(createResponse.status, 201);
    const payload = await createResponse.json();
    assert.deepEqual(payload.data.classRoomIds, ['class-a1', 'class-a2']);
  });
});

test('school_admin peut affecter un enseignant à plusieurs matières', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const createResponse = await apiFetch(baseUrl, '/api/v1/teachers', {
      cookie,
      method: 'POST',
      body: {
        firstName: 'Tariq',
        lastName: 'Salhi',
        email: 'tariq.teacher@test.local',
        classRoomIds: ['class-a1'],
        subjectIds: ['subject-a-math', 'subject-a-fr']
      }
    });

    assert.equal(createResponse.status, 201);
    const payload = await createResponse.json();
    assert.deepEqual(payload.data.subjectIds, ['subject-a-math', 'subject-a-fr']);
  });
});

test('isolation tenant stricte pour enseignants', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: adminACookie } = await login(baseUrl, 'admin@school-a.test');
    const { cookie: adminBCookie } = await login(baseUrl, 'admin@school-b.test');

    const createResponse = await apiFetch(baseUrl, '/api/v1/teachers', {
      cookie: adminACookie,
      method: 'POST',
      body: {
        firstName: 'Tenant',
        lastName: 'Teacher',
        email: 'tenant.teacher@test.local',
        classRoomIds: ['class-a1'],
        subjectIds: ['subject-a-math']
      }
    });
    const createdPayload = await createResponse.json();

    const crossTenantRead = await apiFetch(baseUrl, `/api/v1/teachers/${createdPayload.data.id}`, {
      cookie: adminBCookie
    });
    assert.equal(crossTenantRead.status, 404);
  });
});

test('accès enseignant refusé si rôle non autorisé', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'director@school-a.test');
    const response = await apiFetch(baseUrl, '/api/v1/teachers', {
      cookie,
      method: 'POST',
      body: {
        firstName: 'Denied',
        lastName: 'Teacher',
        classRoomIds: ['class-a1'],
        subjectIds: ['subject-a-math']
      }
    });

    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.error.code, 'FORBIDDEN');
  });
});

test('teacher peut sélectionner uniquement ses classes sur la page attendance', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await apiFetch(baseUrl, '/teacher/attendance', { cookie });

    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /class-a1/);
    assert.doesNotMatch(html, /class-a2/);
  });
});

test('teacher peut enregistrer present absent late pour une date donnée', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: teacherCookie } = await login(baseUrl, 'teacher@school-a.test');
    const { cookie: adminCookie } = await login(baseUrl, 'admin@school-a.test');
    const date = '2026-04-20';

    const createStudentAbsentResponse = await apiFetch(baseUrl, '/api/v1/students', {
      cookie: adminCookie,
      method: 'POST',
      body: {
        firstName: 'Attendance',
        lastName: 'Absent',
        admissionNumber: 'A-ATT-1',
        classRoomId: 'class-a1',
        dateOfBirth: '2013-01-01'
      }
    });
    const absentStudentPayload = await createStudentAbsentResponse.json();
    const createStudentLateResponse = await apiFetch(baseUrl, '/api/v1/students', {
      cookie: adminCookie,
      method: 'POST',
      body: {
        firstName: 'Attendance',
        lastName: 'Late',
        admissionNumber: 'A-ATT-2',
        classRoomId: 'class-a1',
        dateOfBirth: '2013-01-02'
      }
    });
    const lateStudentPayload = await createStudentLateResponse.json();

    const saveResponse = await apiFetch(baseUrl, '/api/v1/attendance', {
      cookie: teacherCookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a1',
        date,
        records: [
          { studentId: 'student-a1', status: 'present' },
          { studentId: absentStudentPayload.data.id, status: 'absent' },
          { studentId: lateStudentPayload.data.id, status: 'late' }
        ]
      }
    });
    assert.equal(saveResponse.status, 201);

    const adminRead = await apiFetch(baseUrl, `/api/v1/attendance?date=${date}&classRoomId=class-a1`, { cookie: adminCookie });
    assert.equal(adminRead.status, 200);
    const payload = await adminRead.json();
    const statuses = payload.data.map((record) => record.status);
    assert.ok(statuses.includes('present'));
    assert.ok(statuses.includes('absent'));
    assert.ok(statuses.includes('late'));
    assert.ok(payload.data.every((record) => record.date === date));
  });
});

test('admin peut consulter les enregistrements attendance de son école', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: teacherCookie } = await login(baseUrl, 'teacher@school-a.test');
    const { cookie: adminCookie } = await login(baseUrl, 'admin@school-a.test');
    const date = '2026-04-21';

    await apiFetch(baseUrl, '/api/v1/attendance', {
      cookie: teacherCookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a1',
        date,
        records: [{ studentId: 'student-a1', status: 'present' }]
      }
    });

    const response = await apiFetch(baseUrl, `/api/v1/attendance?date=${date}`, { cookie: adminCookie });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.data.length >= 1);
    assert.ok(payload.data.every((record) => record.tenant_id === 'school-a'));
  });
});

test('refus d’accès attendance à une classe non autorisée pour teacher', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await apiFetch(baseUrl, '/api/v1/attendance', {
      cookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a2',
        date: '2026-04-21',
        records: [{ studentId: 'student-a2', status: 'present' }]
      }
    });

    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.error.code, 'FORBIDDEN');
  });
});

test('attendance respecte l’isolation tenant', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: teacherCookie } = await login(baseUrl, 'teacher@school-a.test');
    const { cookie: adminBCookie } = await login(baseUrl, 'admin@school-b.test');
    const date = '2026-04-22';

    await apiFetch(baseUrl, '/api/v1/attendance', {
      cookie: teacherCookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a1',
        date,
        records: [{ studentId: 'student-a1', status: 'present' }]
      }
    });

    const crossTenantRead = await apiFetch(baseUrl, `/api/v1/attendance?date=${date}`, { cookie: adminBCookie });
    assert.equal(crossTenantRead.status, 200);
    const payload = await crossTenantRead.json();
    assert.equal(payload.data.length, 0);
  });
});

test('teacher peut créer un lesson log pour une classe autorisée', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await apiFetch(baseUrl, '/api/v1/lesson-logs', {
      cookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a1',
        subjectId: 'subject-a-math',
        date: '2026-04-22',
        content: 'Fractions et simplification'
      }
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.data.classRoomId, 'class-a1');
    assert.equal(payload.data.subjectId, 'subject-a-math');
  });
});

test('teacher peut créer un homework avec due date', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await apiFetch(baseUrl, '/api/v1/homeworks', {
      cookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a1',
        subjectId: 'subject-a-math',
        dueDate: '2026-04-28',
        title: 'Exercices fractions',
        description: 'Faire les exercices 1 à 5 page 43'
      }
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.data.dueDate, '2026-04-28');
  });
});

test('teacher ne peut pas publier sur une classe non autorisée', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await apiFetch(baseUrl, '/api/v1/homeworks', {
      cookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a2',
        subjectId: 'subject-a-math',
        dueDate: '2026-04-28',
        title: 'Interdit',
        description: 'Classe non assignée'
      }
    });

    assert.equal(response.status, 403);
  });
});

test('teacher ne peut pas publier sur une matière non autorisée', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await apiFetch(baseUrl, '/api/v1/lesson-logs', {
      cookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a1',
        subjectId: 'subject-a-fr',
        date: '2026-04-22',
        content: 'Tentative hors matière assignée'
      }
    });

    assert.equal(response.status, 403);
  });
});

test('parent voit uniquement les devoirs liés à ses enfants', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: teacherCookie } = await login(baseUrl, 'teacher@school-a.test');
    const { cookie: parentCookie } = await login(baseUrl, 'parent@school-a.test');

    await apiFetch(baseUrl, '/api/v1/homeworks', {
      cookie: teacherCookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a1',
        subjectId: 'subject-a-math',
        dueDate: '2026-04-27',
        title: 'HW A1',
        description: 'Pour classe A1'
      }
    });

    const listResponse = await apiFetch(baseUrl, '/api/v1/homeworks', { cookie: parentCookie });
    assert.equal(listResponse.status, 200);
    const payload = await listResponse.json();
    assert.ok(payload.data.length >= 1);
    assert.ok(payload.data.every((homework) => homework.classRoomId === 'class-a1' || homework.classRoomId === 'class-a2'));
  });
});

test('student voit uniquement ses propres devoirs', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: teacherCookie } = await login(baseUrl, 'teacher@school-a.test');
    const { cookie: studentCookie } = await login(baseUrl, 'student@school-a.test');

    await apiFetch(baseUrl, '/api/v1/homeworks', {
      cookie: teacherCookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a1',
        subjectId: 'subject-a-math',
        dueDate: '2026-04-29',
        title: 'HW Student',
        description: 'Visible student-a1'
      }
    });

    const response = await apiFetch(baseUrl, '/api/v1/homeworks', { cookie: studentCookie });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.data.length >= 1);
    assert.ok(payload.data.every((homework) => homework.classRoomId === 'class-a1'));
  });
});

test('lesson logs et homeworks respectent l’isolation tenant stricte', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: teacherCookie } = await login(baseUrl, 'teacher@school-a.test');
    const { cookie: adminBCookie } = await login(baseUrl, 'admin@school-b.test');

    await apiFetch(baseUrl, '/api/v1/homeworks', {
      cookie: teacherCookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a1',
        subjectId: 'subject-a-math',
        dueDate: '2026-05-01',
        title: 'Isolation',
        description: 'Tenant A only'
      }
    });

    const crossTenantRead = await apiFetch(baseUrl, '/api/v1/homeworks', { cookie: adminBCookie });
    assert.equal(crossTenantRead.status, 200);
    const payload = await crossTenantRead.json();
    assert.equal(payload.data.length, 0);
  });
});

test('listing teacher renvoie uniquement ses données autorisées', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');

    await apiFetch(baseUrl, '/api/v1/lesson-logs', {
      cookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a1',
        subjectId: 'subject-a-math',
        date: '2026-04-22',
        content: 'Log pour listing'
      }
    });

    const response = await apiFetch(baseUrl, '/api/v1/lesson-logs', { cookie });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.data.length >= 1);
    assert.ok(payload.data.every((entry) => entry.teacherId === 'teacher-a1'));
  });
});

test('teacher peut créer une évaluation pour une classe autorisée', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await apiFetch(baseUrl, '/api/v1/assessments', {
      cookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a1',
        subjectId: 'subject-a-math',
        title: 'Devoir surveillé 1',
        date: '2026-04-23',
        coefficient: 1
      }
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.data.tenant_id, 'school-a');
    assert.equal(payload.data.classRoomId, 'class-a1');
    assert.equal(payload.data.teacherId, 'teacher-a1');
  });
});

test('teacher peut saisir des notes pour les élèves de sa classe autorisée', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const createAssessment = await apiFetch(baseUrl, '/api/v1/assessments', {
      cookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a1',
        subjectId: 'subject-a-math',
        title: 'Interro chapitre 2',
        date: '2026-04-24',
        coefficient: 1.5
      }
    });
    const assessmentPayload = await createAssessment.json();

    const saveGrades = await apiFetch(baseUrl, `/api/v1/assessments/${assessmentPayload.data.id}/grades`, {
      cookie,
      method: 'POST',
      body: {
        entries: [{ studentId: 'student-a1', score: 16.5, remark: 'Bon travail' }]
      }
    });

    assert.equal(saveGrades.status, 201);
    const listGrades = await apiFetch(baseUrl, '/api/v1/grades', { cookie });
    const listPayload = await listGrades.json();
    assert.ok(listPayload.data.some((entry) => entry.assessmentId === assessmentPayload.data.id && entry.studentId === 'student-a1'));
  });
});

test('teacher ne peut pas créer/saisir sur une classe non autorisée', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const createResponse = await apiFetch(baseUrl, '/api/v1/assessments', {
      cookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a2',
        subjectId: 'subject-a-math',
        title: 'Tentative interdite',
        date: '2026-04-24',
        coefficient: 1
      }
    });

    assert.equal(createResponse.status, 403);
  });
});

test('parent voit uniquement les notes de ses enfants liés', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: teacherCookie } = await login(baseUrl, 'teacher@school-a.test');
    const { cookie: parentCookie } = await login(baseUrl, 'parent@school-a.test');

    const createAssessment = await apiFetch(baseUrl, '/api/v1/assessments', {
      cookie: teacherCookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a1',
        subjectId: 'subject-a-math',
        title: 'Evaluation parent',
        date: '2026-04-25',
        coefficient: 1
      }
    });
    const assessmentPayload = await createAssessment.json();

    await apiFetch(baseUrl, `/api/v1/assessments/${assessmentPayload.data.id}/grades`, {
      cookie: teacherCookie,
      method: 'POST',
      body: {
        entries: [{ studentId: 'student-a1', score: 14 }]
      }
    });

    const listResponse = await apiFetch(baseUrl, '/api/v1/grades', { cookie: parentCookie });
    assert.equal(listResponse.status, 200);
    const payload = await listResponse.json();
    assert.ok(payload.data.length >= 1);
    assert.ok(payload.data.every((entry) => entry.studentId === 'student-a1' || entry.studentId === 'student-a2'));
    assert.ok(payload.data.every((entry) => entry.tenant_id === 'school-a'));
  });
});

test('student voit uniquement ses propres notes', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: teacherCookie } = await login(baseUrl, 'teacher@school-a.test');
    const { cookie: studentCookie } = await login(baseUrl, 'student@school-a.test');

    const createAssessment = await apiFetch(baseUrl, '/api/v1/assessments', {
      cookie: teacherCookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a1',
        subjectId: 'subject-a-math',
        title: 'Evaluation student',
        date: '2026-04-26',
        coefficient: 1
      }
    });
    const assessmentPayload = await createAssessment.json();
    await apiFetch(baseUrl, `/api/v1/assessments/${assessmentPayload.data.id}/grades`, {
      cookie: teacherCookie,
      method: 'POST',
      body: {
        entries: [{ studentId: 'student-a1', score: 18 }]
      }
    });

    const listResponse = await apiFetch(baseUrl, '/api/v1/grades', { cookie: studentCookie });
    assert.equal(listResponse.status, 200);
    const payload = await listResponse.json();
    assert.ok(payload.data.length >= 1);
    assert.ok(payload.data.every((entry) => entry.studentId === 'student-a1'));
  });
});

test('isolation tenant stricte sur les notes et évaluations', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: teacherCookie } = await login(baseUrl, 'teacher@school-a.test');
    const { cookie: adminBCookie } = await login(baseUrl, 'admin@school-b.test');

    const createAssessment = await apiFetch(baseUrl, '/api/v1/assessments', {
      cookie: teacherCookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a1',
        subjectId: 'subject-a-math',
        title: 'Isolation grading',
        date: '2026-04-26',
        coefficient: 1
      }
    });
    const assessmentPayload = await createAssessment.json();
    await apiFetch(baseUrl, `/api/v1/assessments/${assessmentPayload.data.id}/grades`, {
      cookie: teacherCookie,
      method: 'POST',
      body: {
        entries: [{ studentId: 'student-a1', score: 12 }]
      }
    });

    const listResponse = await apiFetch(baseUrl, '/api/v1/grades', { cookie: adminBCookie });
    assert.equal(listResponse.status, 200);
    const payload = await listResponse.json();
    assert.equal(payload.data.length, 0);
  });
});
