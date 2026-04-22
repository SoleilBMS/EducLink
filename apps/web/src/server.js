const crypto = require('node:crypto');
const http = require('node:http');

const { authorizeApiRequest, buildError } = require('../../../packages/auth/src/guards/api-guard');
const { requireAuth } = require('../../../packages/auth/src/guards/require-auth');
const { canReadClassRoom, canReadStudent } = require('../../../packages/auth/src/permissions/permissions');
const { ROLES } = require('../../../packages/auth/src/roles/roles');
const { SessionStore } = require('../../../packages/auth/src/session/session-store');
const { filterByTenant } = require('../../../packages/core/src/tenantScope');
const { SchoolStructureRepository } = require('../../../packages/domain/src/school-structure/repository');
const { ENTITY_TYPES, SchoolStructureService } = require('../../../packages/domain/src/school-structure/service');

const users = [
  { id: 'super-1', email: 'super@platform.test', password: 'password123', role: ROLES.SUPER_ADMIN, tenantId: 'platform' },
  { id: 'admin-a', email: 'admin@school-a.test', password: 'password123', role: ROLES.SCHOOL_ADMIN, tenantId: 'school-a' },
  { id: 'director-a', email: 'director@school-a.test', password: 'password123', role: ROLES.DIRECTOR, tenantId: 'school-a' },
  { id: 'teacher-a', email: 'teacher@school-a.test', password: 'password123', role: ROLES.TEACHER, tenantId: 'school-a' },
  { id: 'parent-a', email: 'parent@school-a.test', password: 'password123', role: ROLES.PARENT, tenantId: 'school-a' }
];

const classRooms = [
  { id: 'class-a1', tenant_id: 'school-a', teacher_id: 'teacher-a', name: 'Class A1' },
  { id: 'class-b1', tenant_id: 'school-b', teacher_id: 'teacher-b', name: 'Class B1' }
];

const students = [
  { id: 'student-a1', tenant_id: 'school-a', class_id: 'class-a1', full_name: 'Student A1' },
  { id: 'student-b1', tenant_id: 'school-b', class_id: 'class-b1', full_name: 'Student B1' }
];

const parentStudentLinks = [{ parentId: 'parent-a', studentId: 'student-a1' }];
const teacherClassAssignments = [{ teacherId: 'teacher-a', classId: 'class-a1' }];

function createSchoolStructureService() {
  return new SchoolStructureService(
    new SchoolStructureRepository({
      school: [
        { id: 'school-a', tenant_id: 'school-a', name: 'School A', code: 'SCA', created_at: '', updated_at: '' },
        { id: 'school-b', tenant_id: 'school-b', name: 'School B', code: 'SCB', created_at: '', updated_at: '' }
      ],
      academic_year: [
        {
          id: 'year-a-2025',
          tenant_id: 'school-a',
          school_id: 'school-a',
          name: '2025-2026',
          start_date: '2025-09-01',
          end_date: '2026-06-30',
          is_current: true,
          created_at: '',
          updated_at: ''
        }
      ],
      grade_level: [
        { id: 'grade-a-1', tenant_id: 'school-a', school_id: 'school-a', name: '6ème', order_index: 1, created_at: '', updated_at: '' }
      ],
      class_room: [
        { id: 'class-a-6a', tenant_id: 'school-a', school_id: 'school-a', grade_level_id: 'grade-a-1', name: '6A', capacity: 30, created_at: '', updated_at: '' }
      ],
      subject: [
        { id: 'subject-a-math', tenant_id: 'school-a', school_id: 'school-a', name: 'Mathématiques', code: 'MATH', created_at: '', updated_at: '' }
      ],
      term: []
    })
  );
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

function createMeta() {
  return { request_id: crypto.randomUUID() };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function sendApiSuccess(response, data, statusCode = 200) {
  sendJson(response, statusCode, { data, meta: createMeta() });
}

function sendApiError(response, apiError) {
  sendJson(response, apiError.status, { error: apiError.error, meta: createMeta() });
}

function sendValidationError(response, errors) {
  sendJson(response, 422, {
    error: { code: 'VALIDATION_ERROR', message: errors.join('; ') },
    meta: createMeta()
  });
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

function parseForm(body) {
  const params = new URLSearchParams(body);
  const object = {};
  for (const [key, value] of params.entries()) {
    object[key] = value;
  }
  return object;
}

function parseJsonBody(body) {
  if (!body) {
    return {};
  }
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
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

function renderDashboard(context) {
  const canManageSchoolStructure = [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR].includes(context.role);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Dashboard</title></head><body>
    <h1>Dashboard protégé</h1>
    <p>userId: ${context.userId}</p><p>role: ${context.role}</p><p>tenantId: ${context.tenantId}</p>
    ${canManageSchoolStructure ? '<p><a href="/admin/school-structure">Gérer structure école</a></p>' : ''}
    <form method="POST" action="/logout"><button type="submit">Logout</button></form>
  </body></html>`;
}

function renderEntitySection(entityType, label, items, tenantId) {
  return `<section><h2>${label}</h2>
    <ul>${items.map((item) => `<li>${item.name} (${item.id}) <form method="POST" action="/admin/school-structure/${entityType}/${item.id}/update" style="display:inline"><input name="name" value="${item.name}"/><button>Renommer</button></form></li>`).join('')}</ul>
    <form method="POST" action="/admin/school-structure/${entityType}/create">
      <input type="hidden" name="tenant_id" value="${tenantId}" />
      <input name="name" placeholder="Nom" required />
      <button>Créer</button>
    </form>
  </section>`;
}

function renderSchoolStructurePage(context, service, message = '') {
  const tenantId = context.tenantId;
  const schools = service.list('school', tenantId);
  const years = service.list('academic_year', tenantId);
  const terms = service.list('term', tenantId);
  const grades = service.list('grade_level', tenantId);
  const rooms = service.list('class_room', tenantId);
  const subjects = service.list('subject', tenantId);

  const schoolId = schools[0]?.id ?? '';
  const yearId = years[0]?.id ?? '';
  const gradeId = grades[0]?.id ?? '';

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>School structure</title></head><body>
    <h1>Administration structure école</h1>
    <p>tenant: ${tenantId}</p>
    ${message ? `<p>${message}</p>` : ''}
    ${renderEntitySection('school', 'Établissements', schools, tenantId)}
    <section><h2>Années scolaires</h2><ul>${years.map((y) => `<li>${y.name} (${y.start_date} → ${y.end_date}) <form method="POST" action="/admin/school-structure/academic_year/${y.id}/update" style="display:inline"><input name="name" value="${y.name}"/><button>Renommer</button></form></li>`).join('')}</ul>
      <form method="POST" action="/admin/school-structure/academic_year/create">
        <input name="name" placeholder="2026-2027" required/>
        <input name="school_id" value="${schoolId}" required/>
        <input name="start_date" value="2026-09-01" required/>
        <input name="end_date" value="2027-06-30" required/>
        <input name="is_current" value="false" required/>
        <button>Créer année</button>
      </form>
    </section>
    <section><h2>Périodes</h2><ul>${terms.map((t) => `<li>${t.name}</li>`).join('')}</ul>
      <form method="POST" action="/admin/school-structure/term/create">
        <input name="name" value="Trimestre 1" required/>
        <input name="academic_year_id" value="${yearId}" required/>
        <input name="start_date" value="2026-09-01" required/>
        <input name="end_date" value="2026-12-15" required/>
        <input name="order_index" value="1" required/>
        <button>Créer période</button>
      </form>
    </section>
    <section><h2>Niveaux</h2><ul>${grades.map((g) => `<li>${g.name}</li>`).join('')}</ul>
      <form method="POST" action="/admin/school-structure/grade_level/create">
        <input name="name" value="5ème" required/>
        <input name="school_id" value="${schoolId}" required/>
        <input name="order_index" value="2" required/>
        <button>Créer niveau</button>
      </form>
    </section>
    <section><h2>Classes</h2><ul>${rooms.map((r) => `<li>${r.name}</li>`).join('')}</ul>
      <form method="POST" action="/admin/school-structure/class_room/create">
        <input name="name" value="5A" required/>
        <input name="school_id" value="${schoolId}" required/>
        <input name="grade_level_id" value="${gradeId}" required/>
        <input name="capacity" value="30" required/>
        <button>Créer classe</button>
      </form>
    </section>
    <section><h2>Matières</h2><ul>${subjects.map((s) => `<li>${s.name} (${s.code})</li>`).join('')}</ul>
      <form method="POST" action="/admin/school-structure/subject/create">
        <input name="name" value="Français" required/>
        <input name="code" value="FR" required/>
        <input name="school_id" value="${schoolId}" required/>
        <button>Créer matière</button>
      </form>
    </section>
  </body></html>`;
}

function getClassesForSession(session) {
  if (session.role === ROLES.SUPER_ADMIN) {
    return classRooms;
  }

  const scopedByTenant = filterByTenant(classRooms, session.tenantId);
  return scopedByTenant.filter((classRoom) => canReadClassRoom(classRoom, session));
}

function canManageStructure(role) {
  return [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR].includes(role);
}

function mapPayload(entityType, payload) {
  if (entityType === 'academic_year') {
    return {
      name: payload.name,
      school_id: payload.school_id,
      start_date: payload.start_date,
      end_date: payload.end_date,
      is_current: payload.is_current === true || payload.is_current === 'true'
    };
  }

  if (entityType === 'term') {
    return {
      name: payload.name,
      academic_year_id: payload.academic_year_id,
      start_date: payload.start_date,
      end_date: payload.end_date,
      order_index: Number(payload.order_index)
    };
  }

  if (entityType === 'grade_level') {
    return {
      name: payload.name,
      school_id: payload.school_id,
      order_index: Number(payload.order_index)
    };
  }

  if (entityType === 'class_room') {
    return {
      name: payload.name,
      school_id: payload.school_id,
      grade_level_id: payload.grade_level_id,
      capacity: Number(payload.capacity)
    };
  }

  if (entityType === 'subject') {
    return {
      name: payload.name,
      code: payload.code,
      school_id: payload.school_id
    };
  }

  return { name: payload.name };
}

function parseSchoolPath(pathname) {
  const match = pathname.match(/^\/api\/v1\/school-structure\/([a-z_]+)(?:\/([^/]+))?$/);
  if (!match) {
    return null;
  }

  return { entityType: match[1], id: match[2] ?? null };
}

function createServer({ sessionStore = new SessionStore(), schoolStructureService = createSchoolStructureService() } = {}) {
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
      const decision = requireAuth(session);
      if (!decision.allowed) {
        response.writeHead(302, { location: decision.redirectTo });
        response.end();
        return;
      }

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderDashboard(decision.context));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/admin/school-structure') {
      const decision = requireAuth(session);
      if (!decision.allowed) {
        response.writeHead(302, { location: decision.redirectTo });
        response.end();
        return;
      }

      if (!canManageStructure(decision.context.role)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderSchoolStructurePage(decision.context, schoolStructureService, url.searchParams.get('message') ?? ''));
      return;
    }

    if (request.method === 'POST' && url.pathname.startsWith('/admin/school-structure/')) {
      const decision = requireAuth(session);
      if (!decision.allowed || !canManageStructure(decision.context.role)) {
        response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      const adminParts = url.pathname.split('/').filter(Boolean);
      const entityType = adminParts[2];
      if (!ENTITY_TYPES.includes(entityType)) {
        response.writeHead(404);
        response.end('Unknown entity');
        return;
      }

      const form = parseForm(await readBody(request));
      if (adminParts[3] === 'create') {
        const result = schoolStructureService.create(entityType, decision.context.tenantId, mapPayload(entityType, form));
        const message = result.ok ? 'created' : result.errors.join(', ');
        response.writeHead(302, { location: `/admin/school-structure?message=${encodeURIComponent(message)}` });
        response.end();
        return;
      }

      const id = adminParts[3];
      if (adminParts[4] === 'update') {
        const result = schoolStructureService.update(entityType, decision.context.tenantId, id, mapPayload(entityType, form));
        const message = result.ok ? 'updated' : result.errors.join(', ');
        response.writeHead(302, { location: `/admin/school-structure?message=${encodeURIComponent(message)}` });
        response.end();
        return;
      }
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/classes') {
      const decision = authorizeApiRequest(session, null);
      if (!decision.ok) {
        sendApiError(response, decision);
        return;
      }

      sendApiSuccess(response, getClassesForSession(session));
      return;
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/v1/students/')) {
      const studentId = url.pathname.split('/').at(-1);
      const student = students.find((candidate) => candidate.id === studentId);

      if (!student) {
        sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Student not found' }, meta: createMeta() });
        return;
      }

      const authDecision = authorizeApiRequest(session, student, { allowSuperAdminGlobal: true });
      if (!authDecision.ok) {
        sendApiError(response, authDecision);
        return;
      }

      if (!canReadStudent(student, session, { parentStudentLinks, teacherClassAssignments })) {
        sendJson(response, 403, { error: { code: 'FORBIDDEN', message: 'You do not have permission for this student' }, meta: createMeta() });
        return;
      }

      sendApiSuccess(response, student);
      return;
    }

    const schoolPath = parseSchoolPath(url.pathname);
    if (schoolPath && ENTITY_TYPES.includes(schoolPath.entityType)) {
      const authDecision = authorizeApiRequest(session, null, {
        allowedRoles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR]
      });

      if (!authDecision.ok) {
        sendApiError(response, authDecision);
        return;
      }

      if (request.method === 'GET' && !schoolPath.id) {
        sendApiSuccess(response, schoolStructureService.list(schoolPath.entityType, session.tenantId));
        return;
      }

      if (request.method === 'POST' && !schoolPath.id) {
        const parsed = parseJsonBody(await readBody(request));
        if (!parsed) {
          sendApiError(response, buildError(400, 'VALIDATION_ERROR', 'Invalid JSON body'));
          return;
        }

        const result = schoolStructureService.create(schoolPath.entityType, session.tenantId, mapPayload(schoolPath.entityType, parsed));
        if (!result.ok) {
          sendValidationError(response, result.errors);
          return;
        }

        sendApiSuccess(response, result.data, 201);
        return;
      }

      if ((request.method === 'PUT' || request.method === 'PATCH') && schoolPath.id) {
        const parsed = parseJsonBody(await readBody(request));
        if (!parsed) {
          sendApiError(response, buildError(400, 'VALIDATION_ERROR', 'Invalid JSON body'));
          return;
        }

        const result = schoolStructureService.update(
          schoolPath.entityType,
          session.tenantId,
          schoolPath.id,
          mapPayload(schoolPath.entityType, { ...schoolStructureService.list(schoolPath.entityType, session.tenantId).find((i) => i.id === schoolPath.id), ...parsed })
        );

        if (!result.ok) {
          const status = result.code === 'NOT_FOUND' ? 404 : 422;
          sendJson(response, status, { error: { code: result.code, message: result.errors?.join('; ') ?? 'Not found' }, meta: createMeta() });
          return;
        }

        sendApiSuccess(response, result.data);
        return;
      }

      if (request.method === 'DELETE' && schoolPath.id) {
        const result = schoolStructureService.delete(schoolPath.entityType, session.tenantId, schoolPath.id);
        if (!result.ok) {
          sendJson(response, 404, { error: { code: result.code, message: 'Not found' }, meta: createMeta() });
          return;
        }

        sendApiSuccess(response, { deleted: true });
        return;
      }
    }

    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  });
}

module.exports = {
  createServer,
  parseCookies,
  createSchoolStructureService
};

if (require.main === module) {
  const server = createServer();
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`EducLink web app running on http://localhost:${port}`);
  });
}
