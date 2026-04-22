const crypto = require('node:crypto');
const http = require('node:http');

const { authorizeApiRequest } = require('../../../packages/auth/src/guards/api-guard');
const { requireAuth } = require('../../../packages/auth/src/guards/require-auth');
const { ROLES } = require('../../../packages/auth/src/roles/roles');
const { SessionStore } = require('../../../packages/auth/src/session/session-store');
const { ENTITY, CoreSchoolStore, buildValidationError } = require('./modules/core-school');

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
    id: 'director-a',
    email: 'director@school-a.test',
    password: 'password123',
    role: ROLES.DIRECTOR,
    tenantId: 'school-a'
  },
  {
    id: 'admin-b',
    email: 'admin@school-b.test',
    password: 'password123',
    role: ROLES.SCHOOL_ADMIN,
    tenantId: 'school-b'
  }
];

function createSeedData() {
  return {
    schools: [
      { id: 'school-a', tenant_id: 'school-a', name: 'School A', code: 'SCHA', city: 'Alger', country: 'DZ' },
      { id: 'school-b', tenant_id: 'school-b', name: 'School B', code: 'SCHB', city: 'Oran', country: 'DZ' }
    ],
    academicYears: [
      {
        id: 'ay-a-2025',
        tenant_id: 'school-a',
        label: '2025/2026',
        startsAt: '2025-09-01',
        endsAt: '2026-06-30',
        status: 'active'
      },
      {
        id: 'ay-b-2025',
        tenant_id: 'school-b',
        label: '2025/2026',
        startsAt: '2025-09-01',
        endsAt: '2026-06-30',
        status: 'active'
      }
    ],
    terms: [
      {
        id: 'term-a-1',
        tenant_id: 'school-a',
        name: 'Trimester 1',
        academicYearId: 'ay-a-2025',
        startsAt: '2025-09-01',
        endsAt: '2025-12-20'
      }
    ],
    gradeLevels: [
      { id: 'grade-a-1', tenant_id: 'school-a', name: '1ère année', order: 1 },
      { id: 'grade-b-1', tenant_id: 'school-b', name: '1ère année', order: 1 }
    ],
    classRooms: [
      { id: 'class-a1', tenant_id: 'school-a', name: 'A1', gradeLevelId: 'grade-a-1', capacity: 32 },
      { id: 'class-b1', tenant_id: 'school-b', name: 'B1', gradeLevelId: 'grade-b-1', capacity: 30 }
    ],
    subjects: [
      { id: 'subject-a-math', tenant_id: 'school-a', name: 'Mathématiques', code: 'MATH' },
      { id: 'subject-b-math', tenant_id: 'school-b', name: 'Mathématiques', code: 'MATH' }
    ]
  };
}

const entityRoutes = Object.freeze({
  schools: ENTITY.SCHOOL,
  'academic-years': ENTITY.ACADEMIC_YEAR,
  terms: ENTITY.TERM,
  'grade-levels': ENTITY.GRADE_LEVEL,
  'class-rooms': ENTITY.CLASS_ROOM,
  subjects: ENTITY.SUBJECT
});

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

function sendApiError(response, statusCode, code, message) {
  sendJson(response, statusCode, {
    error: {
      code,
      message
    },
    meta: createMeta()
  });
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

async function parseJsonBody(request) {
  const rawBody = await readBody(request);
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw buildValidationError('Request body must be valid JSON');
  }
}

function parseForm(formBody) {
  const searchParams = new URLSearchParams(formBody);
  return {
    email: searchParams.get('email') ?? '',
    password: searchParams.get('password') ?? ''
  };
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
    <p><a href="/admin/core-structure">Admin référentiel établissement</a></p>
    <form method="POST" action="/logout"><button type="submit">Logout</button></form>
  </body>
</html>`;
}

function renderAdminCoreStructurePage(session) {
  return `<!doctype html>
<html lang="fr">
  <head><meta charset="utf-8"><title>Core structure</title></head>
  <body>
    <h1>Core school structure</h1>
    <p>Tenant: ${session.tenantId}</p>
    <p>Role: ${session.role}</p>
    <ul>
      <li><a href="/api/v1/schools">API Schools</a></li>
      <li><a href="/api/v1/academic-years">API Academic years</a></li>
      <li><a href="/api/v1/terms">API Terms</a></li>
      <li><a href="/api/v1/grade-levels">API Grade levels</a></li>
      <li><a href="/api/v1/class-rooms">API Class rooms</a></li>
      <li><a href="/api/v1/subjects">API Subjects</a></li>
    </ul>
    <p>Utiliser les endpoints API pour CRUD (POST/PUT/DELETE) avec JSON.</p>
    <p><a href="/dashboard">Retour dashboard</a></p>
  </body>
</html>`;
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

function ensureRoleAllowed(session, writeOperation) {
  const allowedRoles = writeOperation
    ? [ROLES.SCHOOL_ADMIN, ROLES.SUPER_ADMIN]
    : [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.SUPER_ADMIN];

  const result = authorizeApiRequest(session, null, { allowedRoles });
  return result.ok ? null : result;
}

function getTenantScope(session, payload) {
  if (session.role === ROLES.SUPER_ADMIN) {
    const tenantId = payload?.tenantId;
    if (typeof tenantId === 'string' && tenantId.trim().length > 0) {
      return tenantId.trim();
    }

    throw buildValidationError('tenantId is required for super_admin operations');
  }

  return session.tenantId;
}

function createServer({ sessionStore = new SessionStore(), coreSchoolStore = new CoreSchoolStore(createSeedData()) } = {}) {
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

    if (request.method === 'GET' && url.pathname === '/admin/core-structure') {
      const authDecision = authorizeApiRequest(session, null, {
        allowedRoles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.SUPER_ADMIN]
      });

      if (!authDecision.ok) {
        sendApiError(response, authDecision.status, authDecision.error.code, authDecision.error.message);
        return;
      }

      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(renderAdminCoreStructurePage(session));
      return;
    }

    const entityRequest = parseCoreEntityRequest(url.pathname);
    if (entityRequest) {
      const isWriteOperation = ['POST', 'PUT', 'DELETE'].includes(request.method);
      const roleError = ensureRoleAllowed(session, isWriteOperation);

      if (roleError) {
        sendApiError(response, roleError.status, roleError.error.code, roleError.error.message);
        return;
      }

      try {
        if (request.method === 'GET' && !entityRequest.id) {
          const tenantId = getTenantScope(session, Object.fromEntries(url.searchParams));
          sendApiSuccess(response, coreSchoolStore.list(entityRequest.entity, tenantId));
          return;
        }

        if (request.method === 'GET' && entityRequest.id) {
          const tenantId = getTenantScope(session, Object.fromEntries(url.searchParams));
          const item = coreSchoolStore.get(entityRequest.entity, tenantId, entityRequest.id);

          if (!item) {
            sendApiError(response, 404, 'NOT_FOUND', 'Resource not found');
            return;
          }

          sendApiSuccess(response, item);
          return;
        }

        if (request.method === 'POST') {
          const payload = await parseJsonBody(request);
          const tenantId = getTenantScope(session, payload);
          const created = coreSchoolStore.create(entityRequest.entity, tenantId, payload);
          sendApiSuccess(response, created, 201);
          return;
        }

        if (request.method === 'PUT' && entityRequest.id) {
          const payload = await parseJsonBody(request);
          const tenantId = getTenantScope(session, payload);
          const updated = coreSchoolStore.update(entityRequest.entity, tenantId, entityRequest.id, payload);

          if (!updated) {
            sendApiError(response, 404, 'NOT_FOUND', 'Resource not found');
            return;
          }

          sendApiSuccess(response, updated);
          return;
        }

        if (request.method === 'DELETE' && entityRequest.id) {
          const payload = await parseJsonBody(request);
          const tenantId = getTenantScope(session, payload);
          const deleted = coreSchoolStore.delete(entityRequest.entity, tenantId, entityRequest.id);

          if (!deleted) {
            sendApiError(response, 404, 'NOT_FOUND', 'Resource not found');
            return;
          }

          response.writeHead(204);
          response.end();
          return;
        }
      } catch (error) {
        if (error.code === 'VALIDATION_ERROR') {
          sendApiError(response, error.status ?? 400, error.code, error.message);
          return;
        }

        sendApiError(response, 500, 'INTERNAL_SERVER_ERROR', 'Unexpected error');
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
  createSeedData
};

if (require.main === module) {
  const server = createServer();
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`EducLink web app running on http://localhost:${port}`);
  });
}
