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

async function expectLogin(baseUrl, { email, expectedLocation }) {
  const { response, cookie } = await login(baseUrl, email);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), expectedLocation);
  assert.ok(cookie);
  return cookie;
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

test('smoke: login + dashboard routing by role', async () => {
  await withServer(async (baseUrl) => {
    const adminCookie = await expectLogin(baseUrl, {
      email: 'admin@school-a.test',
      expectedLocation: '/dashboard/admin'
    });
    const teacherCookie = await expectLogin(baseUrl, {
      email: 'teacher@school-a.test',
      expectedLocation: '/dashboard/teacher'
    });
    const parentCookie = await expectLogin(baseUrl, {
      email: 'parent@school-a.test',
      expectedLocation: '/dashboard/parent'
    });

    const [adminDashboard, teacherDashboard, parentDashboard] = await Promise.all([
      apiFetch(baseUrl, '/dashboard/admin', { cookie: adminCookie }),
      apiFetch(baseUrl, '/dashboard/teacher', { cookie: teacherCookie }),
      apiFetch(baseUrl, '/dashboard/parent', { cookie: parentCookie })
    ]);

    assert.equal(adminDashboard.status, 200);
    assert.equal(teacherDashboard.status, 200);
    assert.equal(parentDashboard.status, 200);

    const forbiddenAdminDashboard = await apiFetch(baseUrl, '/dashboard/admin', { cookie: teacherCookie });
    assert.equal(forbiddenAdminDashboard.status, 403);
  });
});

test('smoke: admin creates student, teacher records attendance and grades with authorization checks', async () => {
  await withServer(async (baseUrl) => {
    const adminCookie = await expectLogin(baseUrl, {
      email: 'admin@school-a.test',
      expectedLocation: '/dashboard/admin'
    });
    const teacherCookie = await expectLogin(baseUrl, {
      email: 'teacher@school-a.test',
      expectedLocation: '/dashboard/teacher'
    });
    const parentCookie = await expectLogin(baseUrl, {
      email: 'parent@school-a.test',
      expectedLocation: '/dashboard/parent'
    });

    const createStudentResponse = await apiFetch(baseUrl, '/api/v1/students', {
      cookie: adminCookie,
      method: 'POST',
      body: {
        firstName: 'Smoke',
        lastName: 'Student',
        admissionNumber: 'A-SMOKE-001',
        classRoomId: 'class-a1',
        dateOfBirth: '2014-01-13'
      }
    });
    assert.equal(createStudentResponse.status, 201);
    const createStudentPayload = await createStudentResponse.json();
    assert.equal(createStudentPayload.data.tenant_id, 'school-a');

    const parentCreateStudent = await apiFetch(baseUrl, '/api/v1/students', {
      cookie: parentCookie,
      method: 'POST',
      body: {
        firstName: 'Nope',
        lastName: 'Denied',
        admissionNumber: 'A-SMOKE-002',
        classRoomId: 'class-a1',
        dateOfBirth: '2014-01-13'
      }
    });
    assert.equal(parentCreateStudent.status, 403);

    const attendanceResponse = await apiFetch(baseUrl, '/api/v1/attendance', {
      cookie: teacherCookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a1',
        date: '2026-04-22',
        records: [
          { studentId: 'student-a1', status: 'present' },
          { studentId: 'student-a3', status: 'late' }
        ]
      }
    });
    assert.equal(attendanceResponse.status, 201);

    const forbiddenAttendance = await apiFetch(baseUrl, '/api/v1/attendance', {
      cookie: teacherCookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a2',
        date: '2026-04-22',
        records: [{ studentId: 'student-a2', status: 'present' }]
      }
    });
    assert.equal(forbiddenAttendance.status, 403);

    const createAssessment = await apiFetch(baseUrl, '/api/v1/assessments', {
      cookie: teacherCookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a1',
        subjectId: 'subject-a-math',
        title: 'Smoke assessment',
        date: '2026-04-22',
        coefficient: 1
      }
    });
    assert.equal(createAssessment.status, 201);
    const assessmentPayload = await createAssessment.json();

    const saveGrades = await apiFetch(baseUrl, `/api/v1/assessments/${assessmentPayload.data.id}/grades`, {
      cookie: teacherCookie,
      method: 'POST',
      body: {
        entries: [
          { studentId: 'student-a1', score: 15, remark: 'Bon trimestre' },
          { studentId: 'student-a3', score: 14, remark: 'En progression' }
        ]
      }
    });
    assert.equal(saveGrades.status, 201);
  });
});

test('smoke: parent sees only linked child data and tenant scope is enforced', async () => {
  await withServer(async (baseUrl) => {
    const teacher2Cookie = await expectLogin(baseUrl, {
      email: 'teacher2@school-a.test',
      expectedLocation: '/dashboard/teacher'
    });
    const parentCookie = await expectLogin(baseUrl, {
      email: 'parent2@school-a.test',
      expectedLocation: '/dashboard/parent'
    });
    const adminBCookie = await expectLogin(baseUrl, {
      email: 'admin@school-b.test',
      expectedLocation: '/dashboard/admin'
    });

    const createAssessment = await apiFetch(baseUrl, '/api/v1/assessments', {
      cookie: teacher2Cookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a2',
        subjectId: 'subject-a-fr',
        title: 'Parent visibility smoke',
        date: '2026-04-23',
        coefficient: 1
      }
    });
    assert.equal(createAssessment.status, 201);
    const assessmentPayload = await createAssessment.json();

    const saveGrades = await apiFetch(baseUrl, `/api/v1/assessments/${assessmentPayload.data.id}/grades`, {
      cookie: teacher2Cookie,
      method: 'POST',
      body: {
        entries: [
          { studentId: 'student-a2', score: 16, remark: 'Très bien' },
          { studentId: 'student-a4', score: 13, remark: 'Continue' }
        ]
      }
    });
    assert.equal(saveGrades.status, 201);

    const parentGrades = await apiFetch(baseUrl, '/api/v1/grades', { cookie: parentCookie });
    assert.equal(parentGrades.status, 200);
    const parentPayload = await parentGrades.json();
    assert.ok(parentPayload.data.length >= 1);
    assert.ok(parentPayload.data.every((entry) => ['student-a2', 'student-a4'].includes(entry.studentId)));

    const parentStudentRead = await apiFetch(baseUrl, '/api/v1/students/student-b1', { cookie: parentCookie });
    assert.equal(parentStudentRead.status, 403);

    const tenantBStudentList = await apiFetch(baseUrl, '/api/v1/students', { cookie: adminBCookie });
    assert.equal(tenantBStudentList.status, 200);
    const tenantBPayload = await tenantBStudentList.json();
    assert.ok(tenantBPayload.data.every((student) => student.tenant_id === 'school-b'));
  });
});
