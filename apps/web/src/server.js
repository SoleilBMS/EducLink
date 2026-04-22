const http = require('node:http');

const { authorizeApiRequest } = require('../../../packages/auth/src/guards/api-guard');
const { requireAuth } = require('../../../packages/auth/src/guards/require-auth');
const { ROLES } = require('../../../packages/auth/src/roles/roles');
const { SessionStore } = require('../../../packages/auth/src/session/session-store');
const { ENTITY, CoreSchoolStore, buildValidationError: buildCoreValidationError } = require('./modules/core-school');
const { StudentStore } = require('./modules/student');

const users = [
  { id: 'super-1', email: 'super@platform.test', password: 'password123', role: ROLES.SUPER_ADMIN, tenantId: 'platform' },
  { id: 'admin-a', email: 'admin@school-a.test', password: 'password123', role: ROLES.SCHOOL_ADMIN, tenantId: 'school-a' },
  { id: 'admin-b', email: 'admin@school-b.test', password: 'password123', role: ROLES.SCHOOL_ADMIN, tenantId: 'school-b' },
  { id: 'director-a', email: 'director@school-a.test', password: 'password123', role: ROLES.DIRECTOR, tenantId: 'school-a' }
];

function createSeedData() {
  return {
    schools: [
      { id: 'school-a', tenant_id: 'school-a', name: 'School A', code: 'SCHA', city: 'Alger', country: 'DZ' },
      { id: 'school-b', tenant_id: 'school-b', name: 'School B', code: 'SCHB', city: 'Oran', country: 'DZ' }
    ],
    academicYears: [
      { id: 'ay-a-2025', tenant_id: 'school-a', label: '2025/2026', startsAt: '2025-09-01', endsAt: '2026-06-30', status: 'active' },
      { id: 'ay-b-2025', tenant_id: 'school-b', label: '2025/2026', startsAt: '2025-09-01', endsAt: '2026-06-30', status: 'active' }
    ],
    terms: [
      { id: 'term-a-1', tenant_id: 'school-a', name: 'Trimester 1', academicYearId: 'ay-a-2025', startsAt: '2025-09-01', endsAt: '2025-12-20' }
    ],
    gradeLevels: [
      { id: 'grade-a-1', tenant_id: 'school-a', name: '1ère année', order: 1 },
      { id: 'grade-b-1', tenant_id: 'school-b', name: '1ère année', order: 1 }
    ],
    classRooms: [
      { id: 'class-a1', tenant_id: 'school-a', name: 'A1', gradeLevelId: 'grade-a-1', capacity: 32 },
      { id: 'class-a2', tenant_id: 'school-a', name: 'A2', gradeLevelId: 'grade-a-1', capacity: 30 },
      { id: 'class-b1', tenant_id: 'school-b', name: 'B1', gradeLevelId: 'grade-b-1', capacity: 30 }
    ],
    subjects: [
      { id: 'subject-a-math', tenant_id: 'school-a', name: 'Mathématiques', code: 'MATH' },
      { id: 'subject-b-math', tenant_id: 'school-b', name: 'Mathématiques', code: 'MATH' }
    ],
    students: [
      {
        id: 'student-a1',
        tenant_id: 'school-a',
        firstName: 'Aya',
        lastName: 'Nadir',
        admissionNumber: 'A-001',
        classRoomId: 'class-a1',
        dateOfBirth: '2013-03-09',
        archived_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'student-b1',
        tenant_id: 'school-b',
        firstName: 'Bilal',
        lastName: 'Haddad',
        admissionNumber: 'B-001',
        classRoomId: 'class-b1',
        dateOfBirth: '2012-12-01',
        archived_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ]
  };
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((cookies, entry) => {
      const [name, ...rawValue] = entry.split('=');
      cookies[name] = decodeURIComponent(rawValue.join('='));
      return cookies;
    }, {});
}

function readBody(request) {
  return new Promise((resolve) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => resolve(body));
  });
}

async function parseJsonBody(request) {
  const rawBody = await readBody(request);
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw buildCoreValidationError('Request body must be valid JSON');
  }
}

function parseForm(formBody) {
  const searchParams = new URLSearchParams(formBody);
  return {
    email: searchParams.get('email') ?? '',
    password: searchParams.get('password') ?? ''
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function sendApiSuccess(response, data, statusCode = 200) {
  sendJson(response, statusCode, {
    data,
    meta: { request_id: crypto.randomUUID() }
  });
}

const crypto = require('node:crypto');

function sendApiError(response, statusCode, code, message) {
  sendJson(response, statusCode, {
    error: { code, message },
    meta: { request_id: crypto.randomUUID() }
  });
}

function canManageStudents(session) {
  return session.role === ROLES.SCHOOL_ADMIN;
}

function canViewStudents(session) {
  return session.role === ROLES.SCHOOL_ADMIN || session.role === ROLES.DIRECTOR;
}

const entityRoutes = Object.freeze({
  schools: ENTITY.SCHOOL,
  'academic-years': ENTITY.ACADEMIC_YEAR,
  terms: ENTITY.TERM,
  'grade-levels': ENTITY.GRADE_LEVEL,
  'class-rooms': ENTITY.CLASS_ROOM,
  subjects: ENTITY.SUBJECT
});

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function parseCoreEntityRequest(pathname) {
  const match = pathname.match(/^\/api\/v1\/(schools|academic-years|terms|grade-levels|class-rooms|subjects)(?:\/([^/]+))?$/);
  if (!match) {
    return null;
  }

  return {
    entity: entityRoutes[match[1]],
    id: match[2] ?? null
  };
}

function ensureCoreRoleAllowed(session, writeOperation) {
  const allowedRoles = writeOperation
    ? [ROLES.SCHOOL_ADMIN, ROLES.SUPER_ADMIN]
    : [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.SUPER_ADMIN];
  const auth = authorizeApiRequest(session, null, { allowedRoles });
  return auth.ok ? null : auth;
}

function renderLoginPage(errorMessage = '') {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>EducLink - Login</title></head><body>
    <h1>Connexion EducLink</h1>
    ${errorMessage ? `<p style="color:red">${errorMessage}</p>` : ''}
    <form method="POST" action="/login">
      <label>Email <input type="email" name="email" required /></label><br/>
      <label>Mot de passe <input type="password" name="password" required /></label><br/>
      <button type="submit">Se connecter</button>
    </form>
  </body></html>`;
}

function renderDashboard(session) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Dashboard</title></head><body>
    <h1>Dashboard</h1>
    <p>role: ${session.role}</p>
    <p>tenantId: ${session.tenantId}</p>
    <p><a href="/admin/students">Gérer les élèves</a></p>
    <form method="POST" action="/logout"><button type="submit">Logout</button></form>
  </body></html>`;
}

function renderStudentsPage(session, classRooms, students, selectedClassRoomId = '') {
  const options = ['<option value="">Toutes les classes</option>']
    .concat(classRooms.map((classRoom) => `<option value="${escapeHtml(classRoom.id)}" ${selectedClassRoomId === classRoom.id ? 'selected' : ''}>${escapeHtml(classRoom.name)}</option>`))
    .join('');

  const rows = students
    .map(
      (student) => `<tr>
        <td><a href="/admin/students/${encodeURIComponent(student.id)}">${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</a></td>
        <td>${escapeHtml(student.admissionNumber)}</td>
        <td>${escapeHtml(student.classRoomId)}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Students</title></head><body>
    <h1>Gestion des élèves</h1>
    <p>Tenant: ${session.tenantId}</p>
    <form method="GET" action="/admin/students">
      <label>Filtre classe
        <select name="classRoomId">${options}</select>
      </label>
      <button type="submit">Filtrer</button>
    </form>
    <table border="1"><thead><tr><th>Nom</th><th>Matricule</th><th>Classe</th></tr></thead><tbody>${rows}</tbody></table>
  </body></html>`;
}

function renderStudentProfile(student) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Student profile</title></head><body>
    <h1>Fiche élève</h1>
    <p>id: ${escapeHtml(student.id)}</p>
    <p>Nom: ${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</p>
    <p>Matricule: ${escapeHtml(student.admissionNumber)}</p>
    <p>Classe: ${escapeHtml(student.classRoomId)}</p>
    <p>Date de naissance: ${escapeHtml(student.dateOfBirth || '-')}</p>
    <p>Archivé: ${student.archived_at ? 'oui' : 'non'}</p>
    <p><a href="/admin/students">Retour</a></p>
  </body></html>`;
}

function buildTenantScope(session, params) {
  if (session.role === ROLES.SUPER_ADMIN) {
    const tenantId = params?.tenantId;
    if (typeof tenantId === 'string' && tenantId.trim().length > 0) {
      return tenantId.trim();
    }
    throw buildCoreValidationError('tenantId is required for super_admin operations');
  }
  return session.tenantId;
}

function createServer({ sessionStore = new SessionStore(), seed = createSeedData() } = {}) {
  const coreSchoolStore = new CoreSchoolStore({
    schools: seed.schools,
    academicYears: seed.academicYears,
    terms: seed.terms,
    gradeLevels: seed.gradeLevels,
    classRooms: seed.classRooms,
    subjects: seed.subjects
  });
  const studentStore = new StudentStore({ students: seed.students, classRoomStore: coreSchoolStore });

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const cookies = parseCookies(request.headers.cookie);
    const session = sessionStore.get(cookies.sessionId);

    if (request.method === 'GET' && url.pathname === '/login') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderLoginPage());
      return;
    }

    if (request.method === 'POST' && url.pathname === '/login') {
      const form = parseForm(await readBody(request));
      const user = users.find((candidate) => candidate.email === form.email && candidate.password === form.password);
      if (!user) {
        response.writeHead(401, { 'content-type': 'text/html; charset=utf-8' });
        response.end(renderLoginPage('Identifiants invalides'));
        return;
      }

      const createdSession = sessionStore.create({ userId: user.id, role: user.role, tenantId: user.tenantId });
      response.writeHead(302, { location: '/dashboard', 'set-cookie': `sessionId=${createdSession.id}; HttpOnly; Path=/; SameSite=Lax` });
      response.end();
      return;
    }

    if (request.method === 'POST' && url.pathname === '/logout') {
      sessionStore.destroy(cookies.sessionId);
      response.writeHead(302, { location: '/login', 'set-cookie': 'sessionId=; Max-Age=0; Path=/; SameSite=Lax' });
      response.end();
      return;
    }

    if (request.method === 'GET' && url.pathname === '/dashboard') {
      const auth = requireAuth(session);
      if (!auth.allowed) {
        response.writeHead(302, { location: '/login' });
        response.end();
        return;
      }

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderDashboard(auth.context));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/admin/students') {
      const auth = requireAuth(session);
      if (!auth.allowed || !canViewStudents(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const classRoomId = url.searchParams.get('classRoomId') ?? '';
      const classRooms = coreSchoolStore.list('classRooms', auth.context.tenantId);
      const students = studentStore.list(auth.context.tenantId, { classRoomId: classRoomId || undefined });
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderStudentsPage(auth.context, classRooms, students, classRoomId));
      return;
    }

    if (request.method === 'GET' && /^\/admin\/students\/[^/]+$/.test(url.pathname)) {
      const auth = requireAuth(session);
      if (!auth.allowed || !canViewStudents(auth.context)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const studentId = url.pathname.split('/').at(-1);
      const student = studentStore.get(auth.context.tenantId, studentId);
      if (!student) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderStudentProfile(student));
      return;
    }

    const coreEntityRequest = parseCoreEntityRequest(url.pathname);
    if (coreEntityRequest) {
      const isWriteOperation = ['POST', 'PUT', 'DELETE'].includes(request.method);
      const roleError = ensureCoreRoleAllowed(session, isWriteOperation);
      if (roleError) {
        sendApiError(response, roleError.status, roleError.error.code, roleError.error.message);
        return;
      }

      try {
        if (request.method === 'GET' && !coreEntityRequest.id) {
          const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
          sendApiSuccess(response, coreSchoolStore.list(coreEntityRequest.entity, tenantId));
          return;
        }

        if (request.method === 'GET' && coreEntityRequest.id) {
          const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
          const item = coreSchoolStore.get(coreEntityRequest.entity, tenantId, coreEntityRequest.id);
          if (!item) {
            sendApiError(response, 404, 'NOT_FOUND', 'Resource not found');
            return;
          }
          sendApiSuccess(response, item);
          return;
        }

        if (request.method === 'POST') {
          const payload = await parseJsonBody(request);
          const tenantId = buildTenantScope(session, payload);
          const created = coreSchoolStore.create(coreEntityRequest.entity, tenantId, payload);
          sendApiSuccess(response, created, 201);
          return;
        }

        if (request.method === 'PUT' && coreEntityRequest.id) {
          const payload = await parseJsonBody(request);
          const tenantId = buildTenantScope(session, payload);
          const updated = coreSchoolStore.update(coreEntityRequest.entity, tenantId, coreEntityRequest.id, payload);
          if (!updated) {
            sendApiError(response, 404, 'NOT_FOUND', 'Resource not found');
            return;
          }
          sendApiSuccess(response, updated);
          return;
        }

        if (request.method === 'DELETE' && coreEntityRequest.id) {
          const payload = await parseJsonBody(request);
          const tenantId = buildTenantScope(session, payload);
          const deleted = coreSchoolStore.delete(coreEntityRequest.entity, tenantId, coreEntityRequest.id);
          if (!deleted) {
            sendApiError(response, 404, 'NOT_FOUND', 'Resource not found');
            return;
          }
          response.writeHead(204);
          response.end();
          return;
        }
      } catch (error) {
        sendApiError(response, error.status ?? 400, error.code ?? 'VALIDATION_ERROR', error.message);
        return;
      }
    }

    if (url.pathname === '/api/v1/students' && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, {
        allowedRoles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR]
      });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }

      const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
      const students = studentStore.list(tenantId, {
        classRoomId: url.searchParams.get('classRoomId') ?? undefined
      });
      sendApiSuccess(response, students);
      return;
    }

    if (url.pathname === '/api/v1/students' && request.method === 'POST') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return;
      }

      try {
        const payload = await parseJsonBody(request);
        const tenantId = buildTenantScope(session, payload);
        const student = studentStore.create(tenantId, payload);
        sendApiSuccess(response, student, 201);
      } catch (error) {
        sendApiError(response, error.status ?? 422, error.code ?? 'VALIDATION_ERROR', error.message);
      }
      return;
    }

    const studentByIdMatch = url.pathname.match(/^\/api\/v1\/students\/([^/]+)$/);
    if (studentByIdMatch) {
      const studentId = studentByIdMatch[1];

      if (request.method === 'GET') {
        const auth = authorizeApiRequest(session, null, {
          allowedRoles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR]
        });
        if (!auth.ok) {
          sendApiError(response, auth.status, auth.error.code, auth.error.message);
          return;
        }

        const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
        const student = studentStore.get(tenantId, studentId);
        if (!student) {
          sendApiError(response, 404, 'NOT_FOUND', 'Student not found');
          return;
        }

        sendApiSuccess(response, student);
        return;
      }

      if (request.method === 'PUT') {
        const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
        if (!auth.ok) {
          sendApiError(response, auth.status, auth.error.code, auth.error.message);
          return;
        }

        try {
          const payload = await parseJsonBody(request);
          const tenantId = buildTenantScope(session, payload);
          const updated = studentStore.update(tenantId, studentId, payload);
          if (!updated) {
            sendApiError(response, 404, 'NOT_FOUND', 'Student not found');
            return;
          }
          sendApiSuccess(response, updated);
        } catch (error) {
          sendApiError(response, error.status ?? 422, error.code ?? 'VALIDATION_ERROR', error.message);
        }
        return;
      }

      if (request.method === 'DELETE') {
        const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
        if (!auth.ok) {
          sendApiError(response, auth.status, auth.error.code, auth.error.message);
          return;
        }

        const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
        const archived = studentStore.archive(tenantId, studentId);
        if (!archived) {
          sendApiError(response, 404, 'NOT_FOUND', 'Student not found');
          return;
        }
        sendApiSuccess(response, archived);
        return;
      }
    }

    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  });
}

module.exports = {
  createServer,
  createSeedData,
  parseCookies
};

if (require.main === module) {
  const server = createServer();
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`EducLink web app running on http://localhost:${port}`);
  });
}
