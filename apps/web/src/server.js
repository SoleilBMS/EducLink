const crypto = require('node:crypto');
const http = require('node:http');

const { authorizeApiRequest } = require('../../../packages/auth/src/guards/api-guard');
const { requireAuth } = require('../../../packages/auth/src/guards/require-auth');
const { canReadClassRoom, canReadStudent } = require('../../../packages/auth/src/permissions/permissions');
const { ROLES } = require('../../../packages/auth/src/roles/roles');
const { SessionStore } = require('../../../packages/auth/src/session/session-store');
const { filterByTenant } = require('../../../packages/core/src/tenantScope');

const users = [
  {
    id: 'super-1',
    email: 'super@platform.test',
    password: 'password123',
    role: ROLES.SUPER_ADMIN,
    tenantId: 'platform'
  },
  {
    id: 'admin-a',
    email: 'admin@school-a.test',
    password: 'password123',
    role: ROLES.SCHOOL_ADMIN,
    tenantId: 'school-a'
  },
  {
    id: 'teacher-a',
    email: 'teacher@school-a.test',
    password: 'password123',
    role: ROLES.TEACHER,
    tenantId: 'school-a'
  },
  {
    id: 'parent-a',
    email: 'parent@school-a.test',
    password: 'password123',
    role: ROLES.PARENT,
    tenantId: 'school-a'
  }
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
  sendJson(response, statusCode, {
    data,
    meta: createMeta()
  });
}

function sendApiError(response, apiError) {
  sendJson(response, apiError.status, {
    error: apiError.error,
    meta: createMeta()
  });
}

function renderLoginPage(errorMessage = '') {
  return `<!doctype html>
<html lang="fr">
  <head><meta charset="utf-8"><title>EducLink - Login</title></head>
  <body>
    <h1>Connexion EducLink</h1>
    ${errorMessage ? `<p style="color:red">${errorMessage}</p>` : ''}
    <form method="POST" action="/login">
      <label>Email <input type="email" name="email" required /></label><br/>
      <label>Mot de passe <input type="password" name="password" required /></label><br/>
      <button type="submit">Se connecter</button>
    </form>
    <p><a href="/forgot-password">Mot de passe oublié ?</a></p>
  </body>
</html>`;
}

function renderForgotPasswordPage() {
  return `<!doctype html>
<html lang="fr">
  <head><meta charset="utf-8"><title>Forgot password</title></head>
  <body>
    <h1>Mot de passe oublié</h1>
    <p>Structure prête. Endpoint reset à finaliser.</p>
  </body>
</html>`;
}

function renderProtectedPage(context) {
  return `<!doctype html>
<html lang="fr">
  <head><meta charset="utf-8"><title>Dashboard</title></head>
  <body>
    <h1>Dashboard protégé</h1>
    <p>userId: ${context.userId}</p>
    <p>role: ${context.role}</p>
    <p>tenantId: ${context.tenantId}</p>
    <form method="POST" action="/logout"><button type="submit">Logout</button></form>
  </body>
</html>`;
}

function readBody(request) {
  return new Promise((resolve) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      resolve(body);
    });
  });
}

function parseForm(formBody) {
  const searchParams = new URLSearchParams(formBody);
  return {
    email: searchParams.get('email') ?? '',
    password: searchParams.get('password') ?? ''
  };
}

function getClassesForSession(session) {
  if (session.role === ROLES.SUPER_ADMIN) {
    return classRooms;
  }

  const scopedByTenant = filterByTenant(classRooms, session.tenantId);
  return scopedByTenant.filter((classRoom) => canReadClassRoom(classRoom, session));
}

function createServer({ sessionStore = new SessionStore() } = {}) {
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
      const body = await readBody(request);
      const form = parseForm(body);
      const user = users.find(
        (candidate) => candidate.email === form.email && candidate.password === form.password
      );

      if (!user) {
        response.writeHead(401, { 'content-type': 'text/html; charset=utf-8' });
        response.end(renderLoginPage('Identifiants invalides'));
        return;
      }

      const createdSession = sessionStore.create({
        userId: user.id,
        role: user.role,
        tenantId: user.tenantId
      });

      response.writeHead(302, {
        location: '/dashboard',
        'set-cookie': `sessionId=${createdSession.id}; HttpOnly; Path=/; SameSite=Lax`
      });
      response.end();
      return;
    }

    if (request.method === 'POST' && url.pathname === '/logout') {
      sessionStore.destroy(cookies.sessionId);
      response.writeHead(302, {
        location: '/login',
        'set-cookie': 'sessionId=; Max-Age=0; Path=/; SameSite=Lax'
      });
      response.end();
      return;
    }

    if (request.method === 'GET' && url.pathname === '/forgot-password') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderForgotPasswordPage());
      return;
    }

    if (request.method === 'GET' && url.pathname === '/reset-password') {
      response.writeHead(501, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'not_implemented' }));
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
      response.end(renderProtectedPage(decision.context));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/classes') {
      const decision = authorizeApiRequest(session, null);
      if (!decision.ok) {
        sendApiError(response, decision);
        return;
      }

      const data = getClassesForSession(session);
      sendApiSuccess(response, data);
      return;
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/v1/students/')) {
      const studentId = url.pathname.split('/').at(-1);
      const student = students.find((candidate) => candidate.id === studentId);

      if (!student) {
        sendJson(response, 404, {
          error: { code: 'NOT_FOUND', message: 'Student not found' },
          meta: createMeta()
        });
        return;
      }

      const authDecision = authorizeApiRequest(session, student, {
        allowSuperAdminGlobal: true
      });
      if (!authDecision.ok) {
        sendApiError(response, authDecision);
        return;
      }

      const isAllowed = canReadStudent(student, session, {
        parentStudentLinks,
        teacherClassAssignments
      });

      if (!isAllowed) {
        sendJson(response, 403, {
          error: { code: 'FORBIDDEN', message: 'You do not have permission for this student' },
          meta: createMeta()
        });
        return;
      }

      sendApiSuccess(response, student);
      return;
    }

    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  });
}

module.exports = {
  createServer,
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
