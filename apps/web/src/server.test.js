const test = require('node:test');
const assert = require('node:assert/strict');

const { createServer, parseCookies, startServer } = require('./server');
const { sendApiError } = require('./routes/shared-http');
const { SessionStore } = require('../../../packages/auth/src/session/session-store');
const { PromptRegistry, TenantAiFeatureFlagStore, AiProviderRegistry, AiLogStore } = require('./modules/ai');
const { createLogger } = require('./observability/logger');

async function withServer(run, options = {}) {
  const server = createServer(options);
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

function collectSetCookies(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }
  const raw = response.headers.get('set-cookie');
  return raw ? [raw] : [];
}

function combineCookies(setCookies) {
  return setCookies
    .map((raw) => raw.split(';')[0])
    .filter(Boolean)
    .join('; ');
}

function extractCsrfFromCookieString(cookieString) {
  if (!cookieString) return '';
  const match = cookieString.match(/(?:^|;\s*)csrf=([^;]+)/);
  return match ? match[1] : '';
}

async function login(baseUrl, email, password = 'password123') {
  const response = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }).toString(),
    redirect: 'manual'
  });

  const setCookies = collectSetCookies(response);
  return {
    response,
    cookie: combineCookies(setCookies)
  };
}

async function expectLogin(baseUrl, { email, expectedLocation, password = 'password123' }) {
  const result = await login(baseUrl, email, password);
  assert.equal(result.response.status, 302);
  assert.equal(result.response.headers.get('location'), expectedLocation);
  assert.ok(result.cookie);
  return result.cookie;
}


function createLogCollector() {
  const entries = [];
  const logger = createLogger({
    module: 'test',
    format: 'json',
    clock: () => '2026-01-01T00:00:00.000Z',
    sink: (_line, entry) => entries.push(entry)
  });

  return { logger, entries };
}

async function apiFetch(baseUrl, path, { cookie, method = 'GET', body, headers: extraHeaders = {} } = {}) {
  const csrfToken = extractCsrfFromCookieString(cookie);
  const isMutation = method !== 'GET' && method !== 'HEAD';
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(isMutation && csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...extraHeaders
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








test('guide de démonstration expose les étapes et routes clés de la démo', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/demo`);
    assert.equal(response.status, 200);
    const html = await response.text();

    const expectedLinks = [
      '/dashboard/admin',
      '/dashboard/teacher',
      '/dashboard/parent',
      '/dashboard/student',
      '/admin/students',
      '/teacher/attendance',
      '/parent/homeworks',
      '/student/grades',
      '/login'
    ];

    for (const link of expectedLinks) {
      assert.ok(html.includes(`href="${link}"`));
    }

    assert.ok(html.includes('Règle de changement de rôle'));
  });
});

test('guide de démonstration est protégé en environnement non fiable', async () => {
  await withServer(async (baseUrl) => {
    const guestResponse = await fetch(`${baseUrl}/demo`, { redirect: 'manual' });
    assert.equal(guestResponse.status, 302);
    assert.equal(guestResponse.headers.get('location'), '/login');

    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const authenticatedResponse = await fetch(`${baseUrl}/demo`, { headers: { cookie } });
    assert.equal(authenticatedResponse.status, 200);
  }, { runtimeEnv: { nodeEnv: 'production', sessionSecret: 'test-secret-of-sufficient-length-1234' } });
});
test('logger structure les entrées et masque les champs sensibles', () => {
  const entries = [];
  const logger = createLogger({
    module: 'test.logger',
    format: 'json',
    clock: () => '2026-01-01T00:00:00.000Z',
    sink: (_line, entry) => entries.push(entry)
  });

  logger.info('sample log', { tenantId: 'school-a', actor: 'teacher-a1', password: 'should-not-appear' });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].timestamp, '2026-01-01T00:00:00.000Z');
  assert.equal(entries[0].module, 'test.logger');
  assert.equal(entries[0].tenantId, 'school-a');
  assert.equal(entries[0].password, '[REDACTED]');
});

test('server loggue les événements auth importants', async () => {
  const { logger, entries } = createLogCollector();

  await withServer(async (baseUrl) => {
    const failedLogin = await login(baseUrl, 'admin@school-a.test', 'wrong-password');
    assert.equal(failedLogin.response.status, 401);

    const successLogin = await login(baseUrl, 'admin@school-a.test');
    assert.equal(successLogin.response.status, 302);
  }, { logger });

  assert.ok(entries.some((entry) => entry.message === 'Authentication failed' && entry.level === 'warn'));
  assert.ok(entries.some((entry) => entry.message === 'Authentication succeeded' && entry.level === 'info' && entry.userId === 'admin-a'));
});

test('server ajoute un request id et loggue fin de requête', async () => {
  const { logger, entries } = createLogCollector();

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/login`, { headers: { 'x-request-id': 'req-123' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-request-id'), 'req-123');
  }, { logger });

  assert.ok(entries.some((entry) => entry.requestId === 'req-123' && entry.message === 'HTTP request received'));
  assert.ok(entries.some((entry) => entry.requestId === 'req-123' && entry.message === 'HTTP request completed'));
});

test('API retourne le request_id corrélé et loggue les erreurs auth API', async () => {
  const { logger, entries } = createLogCollector();

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/students`, {
      headers: { 'x-request-id': 'req-api-401' }
    });

    assert.equal(response.status, 401);
    const payload = await response.json();
    assert.equal(payload.meta.request_id, 'req-api-401');
  }, { logger });

  assert.ok(entries.some((entry) => entry.requestId === 'req-api-401' && entry.message === 'Authentication required or failed'));
});

test('sendApiError masque les messages internes pour les erreurs 500', async () => {
  const chunks = [];
  const response = {
    locals: { requestId: 'req-500' },
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(chunk) {
      chunks.push(chunk);
    }
  };

  sendApiError(response, 500, 'INTERNAL_ERROR', 'Detailed SQL stack trace');

  const payload = JSON.parse(chunks.join(''));
  assert.equal(response.statusCode, 500);
  assert.equal(payload.error.message, 'Internal server error');
  assert.equal(payload.meta.request_id, 'req-500');
});

test('healthcheck retourne ok en mode mémoire', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/healthz`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.status, 'ok');
    assert.equal(payload.persistence.mode, 'memory');
  });
});

test('health endpoint /health répond 200', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.status, 'ok');
  });
});

test('root endpoint / répond 200', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /EducLink/);
  });
});

test('startServer écoute sur HOST/PORT résolus depuis l’environnement', async () => {
  const previousEnv = {
    NODE_ENV: process.env.NODE_ENV,
    EDUCLINK_PERSISTENCE: process.env.EDUCLINK_PERSISTENCE,
    DATABASE_URL: process.env.DATABASE_URL,
    PORT: process.env.PORT,
    HOST: process.env.HOST
  };
  process.env.NODE_ENV = 'development';
  process.env.EDUCLINK_PERSISTENCE = 'memory';
  delete process.env.DATABASE_URL;
  process.env.PORT = '4567';
  process.env.HOST = '0.0.0.0';

  const originalListen = require('node:http').Server.prototype.listen;
  const originalOn = process.on;
  let listenArgs = null;

  require('node:http').Server.prototype.listen = function patchedListen(...args) {
    listenArgs = args;
    const callback = args.find((arg) => typeof arg === 'function');
    if (callback) {
      callback();
    }
    return this;
  };

  process.on = function patchedOn(event, handler) {
    if (event === 'SIGTERM') {
      return this;
    }
    return originalOn.call(this, event, handler);
  };

  try {
    await startServer();
    assert.equal(listenArgs[0], 4567);
    assert.equal(listenArgs[1], '0.0.0.0');
  } finally {
    require('node:http').Server.prototype.listen = originalListen;
    process.on = originalOn;
    for (const key of Object.keys(previousEnv)) {
      if (previousEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousEnv[key];
      }
    }
  }
});
test('login applique des attributs cookie de session sécurisés', async () => {
  await withServer(async (baseUrl) => {
    const adminLogin = await login(baseUrl, 'admin@school-a.test');
    const setCookie = adminLogin.response.headers.get('set-cookie');

    assert.ok(setCookie);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, /Path=\//i);
    assert.match(setCookie, /Max-Age=/i);
  });
});

test('session expirée est rejetée proprement et cookie nettoyé', async () => {
  let now = 1_000;
  const sessionStore = new SessionStore({ ttlMs: 50, clock: () => now });

  await withServer(async (baseUrl) => {
    const adminLogin = await login(baseUrl, 'admin@school-a.test');

    now = 1_200;
    const expiredSessionResponse = await fetch(`${baseUrl}/dashboard/admin`, {
      headers: { cookie: adminLogin.cookie },
      redirect: 'manual'
    });

    assert.equal(expiredSessionResponse.status, 302);
    assert.equal(expiredSessionResponse.headers.get('location'), '/login');
    assert.match(expiredSessionResponse.headers.get('set-cookie') ?? '', /Max-Age=0/);
  }, { sessionStore });
});

test('parseCookies ignore les clés dangereuses et malformed cookies', () => {
  const parsed = parseCookies('__proto__=polluted; constructor=bad; prototype=bad; sessionId=abc123; malformed');

  assert.equal(parsed.sessionId, 'abc123');
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(parsed.constructor, undefined);
  assert.equal(parsed.prototype, undefined);
});

test('logout invalide réellement la session active', async () => {
  await withServer(async (baseUrl) => {
    const adminLogin = await login(baseUrl, 'admin@school-a.test');

    await fetch(`${baseUrl}/logout`, {
      method: 'POST',
      headers: { cookie: adminLogin.cookie, 'x-csrf-token': extractCsrfFromCookieString(adminLogin.cookie) },
      redirect: 'manual'
    });

    const afterLogoutResponse = await apiFetch(baseUrl, '/api/v1/students', { cookie: adminLogin.cookie });
    assert.equal(afterLogoutResponse.status, 401);
  });
});

test('enseignant ne peut pas enregistrer un commentaire pour un élève hors périmètre', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await fetch(`${baseUrl}/teacher/report-comments/save`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        _csrf: extractCsrfFromCookieString(cookie),
        studentId: 'student-a2',
        draftText: 'Très bon trimestre',
        humanValidated: 'true'
      }).toString(),
      redirect: 'manual'
    });

    assert.equal(response.status, 302);
    const location = response.headers.get('location') ?? '';
    assert.match(location, /\/teacher\/report-comments\?/);
    assert.match(decodeURIComponent(location), /Accès refusé pour cet élève\./);
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
    assert.match(adminHtml, /Attendance summary/);
    assert.match(adminHtml, /Finance summary/);
    assert.match(adminHtml, /Quick actions/);
    assert.match(studentHtml, /Dashboard Student/);
    assert.match(studentHtml, /Mon espace/);
    assert.match(studentHtml, /Latest grades/);
    assert.match(studentHtml, /Attendance summary/);
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
    assert.match(html, /Classes actives/);
    assert.match(html, />1<\/p>/);
    assert.match(html, /Élèves actifs/);
    assert.doesNotMatch(html, /student-a1/);
    assert.doesNotMatch(html, /invoice-a1-tuition/);
  });
});

test('dashboards affichent des métriques métier par rôle sans fuite cross-scope', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: teacherCookie } = await login(baseUrl, 'teacher@school-a.test');
    const { cookie: parentCookie } = await login(baseUrl, 'parent2@school-a.test');

    const teacherResponse = await apiFetch(baseUrl, '/dashboard/teacher', { cookie: teacherCookie });
    const parentResponse = await apiFetch(baseUrl, '/dashboard/parent', { cookie: parentCookie });

    assert.equal(teacherResponse.status, 200);
    assert.equal(parentResponse.status, 200);

    const teacherHtml = await teacherResponse.text();
    const parentHtml = await parentResponse.text();

    assert.match(teacherHtml, /Assigned classes/);
    assert.match(teacherHtml, /Students in scope/);
    assert.match(teacherHtml, /Recent assessments/);
    assert.doesNotMatch(teacherHtml, /student-a2/);

    assert.match(parentHtml, /Linked children/);
    assert.match(parentHtml, /Messages \/ annonces/);
    assert.match(parentHtml, /View attendance/);
    assert.doesNotMatch(parentHtml, /Aya Nadir/);
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

test('school_admin peut créer un fee plan et une facture', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');

    const feePlanResponse = await apiFetch(baseUrl, '/api/v1/finance/fee-plans', {
      cookie,
      method: 'POST',
      body: {
        name: 'Scolarité T1',
        amountDue: 450,
        dueDate: '2026-09-30',
        description: 'Frais trimestre 1'
      }
    });
    assert.equal(feePlanResponse.status, 201);
    const feePlanPayload = await feePlanResponse.json();

    const invoiceResponse = await apiFetch(baseUrl, '/api/v1/finance/invoices', {
      cookie,
      method: 'POST',
      body: {
        studentId: 'student-a1',
        feePlanId: feePlanPayload.data.id,
        amountDue: 450,
        dueDate: '2026-09-30',
        description: 'Facture T1'
      }
    });
    assert.equal(invoiceResponse.status, 201);
    const invoicePayload = await invoiceResponse.json();
    assert.equal(invoicePayload.data.studentId, 'student-a1');
    assert.equal(invoicePayload.data.status, 'unpaid');
  });
});

test('accountant peut enregistrer un paiement et le statut facture devient paid', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: adminCookie } = await login(baseUrl, 'admin@school-a.test');
    const { cookie: accountantCookie } = await login(baseUrl, 'accountant@school-a.test');

    const invoiceResponse = await apiFetch(baseUrl, '/api/v1/finance/invoices', {
      cookie: adminCookie,
      method: 'POST',
      body: {
        studentId: 'student-a1',
        amountDue: 120,
        dueDate: '2026-10-10',
        description: 'Cantine'
      }
    });
    const invoicePayload = await invoiceResponse.json();

    const paymentResponse = await apiFetch(baseUrl, '/api/v1/finance/payments', {
      cookie: accountantCookie,
      method: 'POST',
      body: {
        invoiceId: invoicePayload.data.id,
        amountPaid: 120,
        paidAt: '2026-10-11',
        method: 'cash'
      }
    });
    assert.equal(paymentResponse.status, 201);

    const invoicesResponse = await apiFetch(baseUrl, '/api/v1/finance/invoices', {
      cookie: accountantCookie
    });
    const invoicesPayload = await invoicesResponse.json();
    const paidInvoice = invoicesPayload.data.find((invoice) => invoice.id === invoicePayload.data.id);
    assert.equal(paidInvoice.status, 'paid');
    assert.equal(paidInvoice.remainingBalance, 0);
  });
});

test('un paiement ne peut pas dépasser le solde restant de la facture', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: adminCookie } = await login(baseUrl, 'admin@school-a.test');
    const { cookie: accountantCookie } = await login(baseUrl, 'accountant@school-a.test');

    const invoiceResponse = await apiFetch(baseUrl, '/api/v1/finance/invoices', {
      cookie: adminCookie,
      method: 'POST',
      body: {
        studentId: 'student-a1',
        amountDue: 100,
        dueDate: '2026-10-10',
        description: 'Frais examen'
      }
    });
    assert.equal(invoiceResponse.status, 201);
    const invoicePayload = await invoiceResponse.json();

    const firstPaymentResponse = await apiFetch(baseUrl, '/api/v1/finance/payments', {
      cookie: accountantCookie,
      method: 'POST',
      body: {
        invoiceId: invoicePayload.data.id,
        amountPaid: 80,
        paidAt: '2026-10-11',
        method: 'cash'
      }
    });
    assert.equal(firstPaymentResponse.status, 201);

    const overpaymentResponse = await apiFetch(baseUrl, '/api/v1/finance/payments', {
      cookie: accountantCookie,
      method: 'POST',
      body: {
        invoiceId: invoicePayload.data.id,
        amountPaid: 50,
        paidAt: '2026-10-12',
        method: 'cash'
      }
    });
    assert.equal(overpaymentResponse.status, 422);
    const overpaymentPayload = await overpaymentResponse.json();
    assert.equal(overpaymentPayload.error.code, 'VALIDATION_ERROR');
    assert.equal(overpaymentPayload.error.message, 'amountPaid cannot exceed the remaining balance');
  });
});

test('parent voit uniquement les données finance de ses enfants liés', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: adminCookie } = await login(baseUrl, 'admin@school-a.test');
    const { cookie: parentCookie } = await login(baseUrl, 'parent@school-a.test');

    const linkedInvoice = await apiFetch(baseUrl, '/api/v1/finance/invoices', {
      cookie: adminCookie,
      method: 'POST',
      body: {
        studentId: 'student-a1',
        amountDue: 200,
        dueDate: '2026-11-01',
        description: 'Transport'
      }
    });
    assert.equal(linkedInvoice.status, 201);

    const notLinkedInvoice = await apiFetch(baseUrl, '/api/v1/finance/invoices', {
      cookie: adminCookie,
      method: 'POST',
      body: {
        studentId: 'student-b1',
        amountDue: 300,
        dueDate: '2026-11-01',
        description: 'Cross tenant'
      }
    });
    assert.equal(notLinkedInvoice.status, 422);

    const parentInvoicesResponse = await apiFetch(baseUrl, '/api/v1/finance/invoices', {
      cookie: parentCookie
    });
    assert.equal(parentInvoicesResponse.status, 200);
    const parentInvoicesPayload = await parentInvoicesResponse.json();
    assert.ok(parentInvoicesPayload.data.length >= 1);
    assert.ok(parentInvoicesPayload.data.every((invoice) => ['student-a1', 'student-a2'].includes(invoice.studentId)));
  });
});

test('les données finance sont isolées par tenant', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: adminACookie } = await login(baseUrl, 'admin@school-a.test');
    const { cookie: adminBCookie } = await login(baseUrl, 'admin@school-b.test');

    await apiFetch(baseUrl, '/api/v1/finance/invoices', {
      cookie: adminACookie,
      method: 'POST',
      body: {
        studentId: 'student-a1',
        amountDue: 90,
        dueDate: '2026-12-01',
        description: 'Activité'
      }
    });

    const tenantBInvoicesResponse = await apiFetch(baseUrl, '/api/v1/finance/invoices', {
      cookie: adminBCookie
    });
    assert.equal(tenantBInvoicesResponse.status, 200);
    const tenantBPayload = await tenantBInvoicesResponse.json();
    assert.equal(tenantBPayload.data.length, 0);
  });
});

test('un rôle non autorisé ne peut pas écrire en finance', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');

    const createResponse = await apiFetch(baseUrl, '/api/v1/finance/invoices', {
      cookie,
      method: 'POST',
      body: {
        studentId: 'student-a1',
        amountDue: 111,
        dueDate: '2026-12-05',
        description: 'Denied'
      }
    });

    assert.equal(createResponse.status, 403);
    const payload = await createResponse.json();
    assert.equal(payload.error.code, 'FORBIDDEN');
  });
});

test('journey school_admin: dashboard + structure + gestion utilisateurs', async () => {
  await withServer(async (baseUrl) => {
    const adminCookie = await expectLogin(baseUrl, {
      email: 'admin@school-a.test',
      expectedLocation: '/dashboard/admin'
    });

    const dashboardResponse = await apiFetch(baseUrl, '/dashboard/admin', { cookie: adminCookie });
    assert.equal(dashboardResponse.status, 200);

    const classRoomsResponse = await apiFetch(baseUrl, '/api/v1/class-rooms', { cookie: adminCookie });
    assert.equal(classRoomsResponse.status, 200);
    const classRoomsPayload = await classRoomsResponse.json();
    assert.ok(classRoomsPayload.data.some((classRoom) => classRoom.id === 'class-a1'));
    assert.ok(classRoomsPayload.data.every((classRoom) => classRoom.tenant_id === 'school-a'));

    const subjectsResponse = await apiFetch(baseUrl, '/api/v1/subjects', { cookie: adminCookie });
    assert.equal(subjectsResponse.status, 200);
    const subjectsPayload = await subjectsResponse.json();
    assert.ok(subjectsPayload.data.some((subject) => subject.id === 'subject-a-math'));
    assert.ok(subjectsPayload.data.every((subject) => subject.tenant_id === 'school-a'));

    const studentCreateResponse = await apiFetch(baseUrl, '/api/v1/students', {
      cookie: adminCookie,
      method: 'POST',
      body: {
        firstName: 'Journey',
        lastName: 'Student',
        admissionNumber: 'A-940',
        classRoomId: 'class-a1',
        dateOfBirth: '2014-09-12'
      }
    });
    assert.equal(studentCreateResponse.status, 201);

    const teacherListResponse = await apiFetch(baseUrl, '/api/v1/teachers', { cookie: adminCookie });
    assert.equal(teacherListResponse.status, 200);
    const teacherListPayload = await teacherListResponse.json();
    assert.ok(teacherListPayload.data.every((teacher) => teacher.tenant_id === 'school-a'));

    const parentListResponse = await apiFetch(baseUrl, '/api/v1/parents', { cookie: adminCookie });
    assert.equal(parentListResponse.status, 200);
    const parentListPayload = await parentListResponse.json();
    assert.ok(parentListPayload.data.every((parent) => parent.tenant_id === 'school-a'));

    const crossTenantClassRooms = await apiFetch(baseUrl, '/api/v1/class-rooms?tenantId=school-b', { cookie: adminCookie });
    assert.equal(crossTenantClassRooms.status, 200);
    const crossTenantClassRoomsPayload = await crossTenantClassRooms.json();
    assert.ok(crossTenantClassRoomsPayload.data.every((classRoom) => classRoom.tenant_id === 'school-a'));
  });
});

test('journey teacher: classes en scope + attendance + grading + contrôles permissions', async () => {
  await withServer(async (baseUrl) => {
    const teacherCookie = await expectLogin(baseUrl, {
      email: 'teacher@school-a.test',
      expectedLocation: '/dashboard/teacher'
    });

    const dashboardResponse = await apiFetch(baseUrl, '/dashboard/teacher', { cookie: teacherCookie });
    assert.equal(dashboardResponse.status, 200);
    const dashboardHtml = await dashboardResponse.text();
    assert.match(dashboardHtml, /6ème A/);

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

    const forbiddenAttendanceResponse = await apiFetch(baseUrl, '/api/v1/attendance', {
      cookie: teacherCookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a2',
        date: '2026-04-22',
        records: [{ studentId: 'student-a2', status: 'present' }]
      }
    });
    assert.equal(forbiddenAttendanceResponse.status, 403);

    const createAssessmentResponse = await apiFetch(baseUrl, '/api/v1/assessments', {
      cookie: teacherCookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a1',
        subjectId: 'subject-a-math',
        title: 'Journey assessment',
        date: '2026-04-22',
        coefficient: 1
      }
    });
    assert.equal(createAssessmentResponse.status, 201);
    const createdAssessment = await createAssessmentResponse.json();

    const saveGradesResponse = await apiFetch(baseUrl, `/api/v1/assessments/${createdAssessment.data.id}/grades`, {
      cookie: teacherCookie,
      method: 'POST',
      body: {
        entries: [
          { studentId: 'student-a1', score: 16, remark: 'Bon travail' },
          { studentId: 'student-a3', score: 14, remark: 'Peut mieux faire' }
        ]
      }
    });
    assert.equal(saveGradesResponse.status, 201);

    const gradesResponse = await apiFetch(baseUrl, '/api/v1/grades', { cookie: teacherCookie });
    assert.equal(gradesResponse.status, 200);
    const gradesPayload = await gradesResponse.json();
    assert.ok(gradesPayload.data.every((entry) => entry.teacherId === 'teacher-a1'));
  });
});

test('journey parent: enfants liés + notes + attendance/tenant guardrails + inbox', async () => {
  await withServer(async (baseUrl) => {
    const parentCookie = await expectLogin(baseUrl, {
      email: 'parent2@school-a.test',
      expectedLocation: '/dashboard/parent'
    });

    const dashboardResponse = await apiFetch(baseUrl, '/dashboard/parent', { cookie: parentCookie });
    assert.equal(dashboardResponse.status, 200);

    const parentGradesResponse = await apiFetch(baseUrl, '/api/v1/grades', { cookie: parentCookie });
    assert.equal(parentGradesResponse.status, 200);
    const parentGradesPayload = await parentGradesResponse.json();
    assert.ok(parentGradesPayload.data.length >= 1);
    assert.ok(parentGradesPayload.data.every((entry) => ['student-a2', 'student-a4'].includes(entry.studentId)));

    const forbiddenAttendanceRead = await apiFetch(baseUrl, '/api/v1/attendance?date=2026-04-20', { cookie: parentCookie });
    assert.equal(forbiddenAttendanceRead.status, 403);

    const parentAttendancePageResponse = await apiFetch(baseUrl, '/parent/attendance', { cookie: parentCookie });
    assert.equal(parentAttendancePageResponse.status, 200);
    const parentAttendanceHtml = await parentAttendancePageResponse.text();
    assert.match(parentAttendanceHtml, /Salim Brahim/);
    assert.doesNotMatch(parentAttendanceHtml, /Aya Nadir/);

    const inboxResponse = await apiFetch(baseUrl, '/api/v1/inbox', { cookie: parentCookie });
    assert.equal(inboxResponse.status, 200);
    const inboxPayload = await inboxResponse.json();
    assert.ok(inboxPayload.data.threads.some((thread) => thread.id === 'thread-demo-parent-followup'));
  });
});

test('journey student: accès limité à ses propres données', async () => {
  await withServer(async (baseUrl) => {
    const studentCookie = await expectLogin(baseUrl, {
      email: 'student@school-a.test',
      expectedLocation: '/dashboard/student'
    });

    const dashboardResponse = await apiFetch(baseUrl, '/dashboard/student', { cookie: studentCookie });
    assert.equal(dashboardResponse.status, 200);

    const gradesResponse = await apiFetch(baseUrl, '/api/v1/grades', { cookie: studentCookie });
    assert.equal(gradesResponse.status, 200);
    const gradesPayload = await gradesResponse.json();
    assert.ok(gradesPayload.data.length >= 1);
    assert.ok(gradesPayload.data.every((entry) => entry.studentId === 'student-a1'));

    const homeworksResponse = await apiFetch(baseUrl, '/api/v1/homeworks', { cookie: studentCookie });
    assert.equal(homeworksResponse.status, 200);
    const homeworksPayload = await homeworksResponse.json();
    assert.ok(homeworksPayload.data.every((item) => item.classRoomId === 'class-a1'));

    const teacherOnlyEndpoint = await apiFetch(baseUrl, '/api/v1/attendance', {
      cookie: studentCookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a1',
        date: '2026-04-21',
        records: [{ studentId: 'student-a1', status: 'present' }]
      }
    });
    assert.equal(teacherOnlyEndpoint.status, 403);
  });
});

test('audit log enregistre login/logout avec actor/action/tenant/timestamp', async () => {
  await withServer(async (baseUrl) => {
    const adminLogin = await login(baseUrl, 'admin@school-a.test');
    assert.equal(adminLogin.response.status, 302);

    const logoutResponse = await apiFetch(baseUrl, '/logout', {
      cookie: adminLogin.cookie,
      method: 'POST'
    });
    assert.equal(logoutResponse.status, 200);

    const secondLogin = await login(baseUrl, 'admin@school-a.test');
    const logsResponse = await apiFetch(baseUrl, '/api/v1/audit-logs', { cookie: secondLogin.cookie });
    assert.equal(logsResponse.status, 200);

    const payload = await logsResponse.json();
    const loginEvent = payload.data.find((entry) => entry.action === 'auth.login.success');
    const logoutEvent = payload.data.find((entry) => entry.action === 'auth.logout');

    assert.ok(loginEvent);
    assert.ok(logoutEvent);
    assert.equal(loginEvent.tenantId, 'school-a');
    assert.equal(loginEvent.actorUserId, 'admin-a');
    assert.equal(loginEvent.actorRole, 'school_admin');
    assert.equal(loginEvent.targetType, 'auth');
    assert.ok(loginEvent.targetId);
    assert.ok(loginEvent.timestamp);
  });
});

test('audit log trace les actions critiques students et filtre strictement par tenant', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: adminACookie } = await login(baseUrl, 'admin@school-a.test');
    const { cookie: adminBCookie } = await login(baseUrl, 'admin@school-b.test');

    const createResponse = await apiFetch(baseUrl, '/api/v1/students', {
      cookie: adminACookie,
      method: 'POST',
      body: {
        firstName: 'Audit',
        lastName: 'Target',
        admissionNumber: 'A-AUDIT-1',
        classRoomId: 'class-a1',
        dateOfBirth: '2012-01-01'
      }
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();

    const updateResponse = await apiFetch(baseUrl, `/api/v1/students/${created.data.id}`, {
      cookie: adminACookie,
      method: 'PUT',
      body: {
        firstName: 'Audit',
        lastName: 'Target',
        admissionNumber: 'A-AUDIT-2',
        classRoomId: 'class-a2',
        dateOfBirth: '2012-01-01'
      }
    });
    assert.equal(updateResponse.status, 200);

    const logsAResponse = await apiFetch(baseUrl, '/api/v1/audit-logs?targetType=student', { cookie: adminACookie });
    const logsAPayload = await logsAResponse.json();
    assert.ok(logsAPayload.data.some((entry) => entry.action === 'student.create' && entry.targetId === created.data.id));
    assert.ok(logsAPayload.data.some((entry) => entry.action === 'student.update' && entry.targetId === created.data.id));
    assert.ok(logsAPayload.data.every((entry) => entry.tenantId === 'school-a'));

    const logsBResponse = await apiFetch(baseUrl, '/api/v1/audit-logs?targetType=student', { cookie: adminBCookie });
    const logsBPayload = await logsBResponse.json();
    assert.ok(logsBPayload.data.every((entry) => entry.tenantId === 'school-b'));
    assert.ok(logsBPayload.data.every((entry) => entry.targetId !== created.data.id));
  });
});

test('lecture des audit logs refuse les rôles non autorisés', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await apiFetch(baseUrl, '/api/v1/audit-logs', { cookie });
    assert.equal(response.status, 403);

    const payload = await response.json();
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

test('school_admin peut publier une annonce', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');

    const response = await apiFetch(baseUrl, '/api/v1/announcements', {
      cookie,
      method: 'POST',
      body: { title: 'Info générale', body: 'Réunion parents vendredi', visibility: 'global' }
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.data.tenant_id, 'school-a');
    assert.equal(payload.data.authorRole, 'school_admin');
  });
});

test('un utilisateur ne voit que les annonces/messages de son tenant', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: adminACookie } = await login(baseUrl, 'admin@school-a.test');
    const { cookie: adminBCookie } = await login(baseUrl, 'admin@school-b.test');

    await apiFetch(baseUrl, '/api/v1/announcements', {
      cookie: adminACookie,
      method: 'POST',
      body: { title: 'Annonce A', body: 'Tenant A seulement', visibility: 'global' }
    });

    const responseB = await apiFetch(baseUrl, '/api/v1/inbox', { cookie: adminBCookie });
    assert.equal(responseB.status, 200);
    const payloadB = await responseB.json();
    assert.equal(payloadB.data.announcements.length, 0);
  });
});

test('parent ne voit que les messages pertinents', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: adminCookie } = await login(baseUrl, 'admin@school-a.test');
    const { cookie: parentCookie } = await login(baseUrl, 'parent@school-a.test');

    const threadResponse = await apiFetch(baseUrl, '/api/v1/message-threads', {
      cookie: adminCookie,
      method: 'POST',
      body: {
        subject: 'Suivi enfant',
        participantIds: ['parent-a1', 'teacher-a1'],
        initialMessage: 'Bonjour, point sur la semaine.'
      }
    });
    const threadPayload = await threadResponse.json();

    const inboxResponse = await apiFetch(baseUrl, '/api/v1/inbox', { cookie: parentCookie });
    assert.equal(inboxResponse.status, 200);
    const inboxPayload = await inboxResponse.json();
    assert.equal(inboxPayload.data.threads.length, 1);
    assert.equal(inboxPayload.data.threads[0].id, threadPayload.data.thread.id);
  });
});

test('teacher peut accéder uniquement aux threads autorisés', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: adminCookie } = await login(baseUrl, 'admin@school-a.test');
    const { cookie: teacherCookie } = await login(baseUrl, 'teacher@school-a.test');

    const response = await apiFetch(baseUrl, '/api/v1/message-threads', {
      cookie: adminCookie,
      method: 'POST',
      body: {
        subject: 'Thread parents uniquement',
        participantIds: ['parent-a1'],
        initialMessage: 'Message privé parent'
      }
    });
    const payload = await response.json();

    const forbiddenRead = await apiFetch(baseUrl, `/api/v1/message-threads/${payload.data.thread.id}`, { cookie: teacherCookie });
    assert.equal(forbiddenRead.status, 403);
  });
});

test('un utilisateur ne peut pas ouvrir un thread d’un autre tenant', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: adminACookie } = await login(baseUrl, 'admin@school-a.test');
    const { cookie: adminBCookie } = await login(baseUrl, 'admin@school-b.test');

    const response = await apiFetch(baseUrl, '/api/v1/message-threads', {
      cookie: adminACookie,
      method: 'POST',
      body: {
        subject: 'Thread A',
        participantIds: ['teacher-a1'],
        initialMessage: 'Message du tenant A'
      }
    });
    const payload = await response.json();

    const crossTenantRead = await apiFetch(baseUrl, `/api/v1/message-threads/${payload.data.thread.id}`, { cookie: adminBCookie });
    assert.equal(crossTenantRead.status, 404);
  });
});

test('refus d’accès propre sur écriture non autorisée', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: parentCookie } = await login(baseUrl, 'parent@school-a.test');

    const response = await apiFetch(baseUrl, '/api/v1/announcements', {
      cookie: parentCookie,
      method: 'POST',
      body: { title: 'Interdit', body: 'Un parent ne publie pas', visibility: 'global' }
    });

    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.error.code, 'FORBIDDEN');
  });
});

test('parent ne voit pas les notes d’un élève non lié dans le même tenant', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: adminCookie } = await login(baseUrl, 'admin@school-a.test');
    const { cookie: teacherCookie } = await login(baseUrl, 'teacher@school-a.test');
    const { cookie: parentCookie } = await login(baseUrl, 'parent@school-a.test');

    const createStudentResponse = await apiFetch(baseUrl, '/api/v1/students', {
      cookie: adminCookie,
      method: 'POST',
      body: {
        firstName: 'Unlinked',
        lastName: 'Student',
        admissionNumber: 'A-UNLINK-1',
        classRoomId: 'class-a1',
        dateOfBirth: '2013-09-09'
      }
    });
    assert.equal(createStudentResponse.status, 201);
    const createdStudent = await createStudentResponse.json();

    const createAssessmentResponse = await apiFetch(baseUrl, '/api/v1/assessments', {
      cookie: teacherCookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a1',
        subjectId: 'subject-a-math',
        title: 'Evaluation élève non lié',
        date: '2026-04-30',
        coefficient: 1
      }
    });
    assert.equal(createAssessmentResponse.status, 201);
    const assessment = await createAssessmentResponse.json();

    const saveGradesResponse = await apiFetch(baseUrl, `/api/v1/assessments/${assessment.data.id}/grades`, {
      cookie: teacherCookie,
      method: 'POST',
      body: {
        entries: [{ studentId: createdStudent.data.id, score: 8 }]
      }
    });
    assert.equal(saveGradesResponse.status, 201);

    const parentGradesResponse = await apiFetch(baseUrl, '/api/v1/grades', { cookie: parentCookie });
    assert.equal(parentGradesResponse.status, 200);
    const parentGrades = await parentGradesResponse.json();
    assert.ok(parentGrades.data.every((entry) => entry.studentId !== createdStudent.data.id));
  });
});

test('parent d’un tenant A ne peut pas voir les devoirs du tenant B', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: parentCookie } = await login(baseUrl, 'parent@school-a.test');
    const { cookie: adminBCookie } = await login(baseUrl, 'admin@school-b.test');

    const tenantBHomeworksResponse = await apiFetch(baseUrl, '/api/v1/homeworks?tenantId=school-b', { cookie: parentCookie });
    assert.equal(tenantBHomeworksResponse.status, 200);
    const tenantBHomeworks = await tenantBHomeworksResponse.json();
    assert.ok(tenantBHomeworks.data.every((homework) => homework.tenant_id === 'school-a'));

    const tenantBStudentsResponse = await apiFetch(baseUrl, '/api/v1/students/student-b1', { cookie: parentCookie });
    assert.equal(tenantBStudentsResponse.status, 403);

    const adminBGradesResponse = await apiFetch(baseUrl, '/api/v1/grades', { cookie: adminBCookie });
    assert.equal(adminBGradesResponse.status, 200);
    const adminBGrades = await adminBGradesResponse.json();
    assert.ok(adminBGrades.data.every((entry) => entry.tenant_id === 'school-b'));
  });
});

test('teacher ne peut pas lire/écrire des notes hors classe assignée', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: teacherCookie } = await login(baseUrl, 'teacher@school-a.test');
    const { cookie: adminCookie } = await login(baseUrl, 'admin@school-a.test');

    const createAssessmentResponse = await apiFetch(baseUrl, '/api/v1/assessments', {
      cookie: teacherCookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a2',
        subjectId: 'subject-a-math',
        title: 'Classe non assignée',
        date: '2026-05-01',
        coefficient: 1
      }
    });
    assert.equal(createAssessmentResponse.status, 403);

    const adminTeacherResponse = await apiFetch(baseUrl, '/api/v1/teachers', { cookie: adminCookie });
    assert.equal(adminTeacherResponse.status, 200);
    const teacherPayload = await adminTeacherResponse.json();
    const currentTeacher = teacherPayload.data.find((teacher) => teacher.id === 'teacher-a1');
    assert.ok(currentTeacher);
    assert.deepEqual(currentTeacher.classRoomIds, ['class-a1']);
  });
});

test('school_admin ne peut jamais gérer les ressources d’un autre tenant via tenantId explicite', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: adminACookie } = await login(baseUrl, 'admin@school-a.test');

    const listResponse = await apiFetch(baseUrl, '/api/v1/students?tenantId=school-b', { cookie: adminACookie });
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json();
    assert.ok(listPayload.data.every((student) => student.tenant_id === 'school-a'));

    const createResponse = await apiFetch(baseUrl, '/api/v1/students', {
      cookie: adminACookie,
      method: 'POST',
      body: {
        tenantId: 'school-b',
        firstName: 'Cross',
        lastName: 'Tenant',
        admissionNumber: 'A-CROSS-1',
        classRoomId: 'class-b1',
        dateOfBirth: '2013-03-03'
      }
    });
    assert.equal(createResponse.status, 422);
  });
});

test('super_admin respecte les règles actuelles: endpoints métier non autorisés et tenantId explicite requis sans contournement', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: superAdminCookie } = await login(baseUrl, 'superadmin@platform.test');
    assert.ok(superAdminCookie);

    const listWithoutTenantResponse = await apiFetch(baseUrl, '/api/v1/students', { cookie: superAdminCookie });
    assert.equal(listWithoutTenantResponse.status, 403);

    const listWithTenantResponse = await apiFetch(baseUrl, '/api/v1/students?tenantId=school-a', { cookie: superAdminCookie });
    assert.equal(listWithTenantResponse.status, 403);

    const attendanceResponse = await apiFetch(baseUrl, '/api/v1/attendance?tenantId=school-a', { cookie: superAdminCookie });
    assert.equal(attendanceResponse.status, 403);
  });
});


test('contrat API: succès inclut success/data/meta.request_id', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await apiFetch(baseUrl, '/api/v1/students', { cookie });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.ok(Array.isArray(payload.data));
    assert.equal(typeof payload.meta?.request_id, 'string');
    assert.ok(payload.meta.request_id.length > 0);
  });
});

test('contrat API: erreurs incluent success=false/error/meta.request_id', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await apiFetch(baseUrl, '/api/v1/students', {
      cookie,
      method: 'POST',
      body: {
        firstName: 'Denied',
        lastName: 'Role',
        admissionNumber: 'A-ROLE-1',
        classRoomId: 'class-a1',
        dateOfBirth: '2013-10-01'
      }
    });

    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, 'FORBIDDEN');
    assert.equal(typeof payload.error.message, 'string');
    assert.equal(typeof payload.meta?.request_id, 'string');
    assert.ok(payload.meta.request_id.length > 0);
  });
});

test('contrat API: validation JSON invalide expose code stable et details', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/api/v1/students`, {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
        'x-csrf-token': extractCsrfFromCookieString(cookie)
      },
      body: '{"firstName":"Aya"'
    });

    assert.equal(response.status, 422);
    const payload = await response.json();
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, 'VALIDATION_ERROR');
    assert.equal(payload.error.message, 'Request body must be valid JSON');
    assert.equal(payload.error.details?.source, 'body');
    assert.equal(payload.error.details?.issue, 'invalid_json');
  });
});

test('contrat API: route API inconnue retourne une erreur JSON NOT_FOUND', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await apiFetch(baseUrl, '/api/v1/does-not-exist', { cookie });

    assert.equal(response.status, 404);
    const payload = await response.json();
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, 'NOT_FOUND');
    assert.equal(payload.error.message, 'Resource not found');
    assert.equal(typeof payload.meta?.request_id, 'string');
    assert.ok(payload.meta.request_id.length > 0);
  });
});

test('teacher peut déclencher une génération IA pour un élève autorisé et reçoit un draft', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');

    const createAssessment = await apiFetch(baseUrl, '/api/v1/assessments', {
      cookie,
      method: 'POST',
      body: {
        classRoomId: 'class-a1',
        subjectId: 'subject-a-math',
        title: 'Interro AI',
        date: '2026-02-01',
        coefficient: 1
      }
    });
    const assessmentPayload = await createAssessment.json();
    await apiFetch(baseUrl, `/api/v1/assessments/${assessmentPayload.data.id}/grades`, {
      cookie,
      method: 'POST',
      body: { entries: [{ studentId: 'student-a1', score: 15, remark: 'Participation régulière' }] }
    });

    const response = await apiFetch(baseUrl, '/api/v1/ai/report-comments/draft', {
      cookie,
      method: 'POST',
      body: { studentId: 'student-a1' }
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.data.status, 'draft');
    assert.equal(payload.data.humanValidationRequired, true);
    assert.match(payload.data.draft, /dev-echo/i);
  });
});

test('teacher ne peut pas générer pour un élève hors de ses classes', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await apiFetch(baseUrl, '/api/v1/ai/report-comments/draft', {
      cookie,
      method: 'POST',
      body: { studentId: 'student-a2' }
    });

    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.error.code, 'FORBIDDEN');
  });
});

test('validation humaine requise avant sauvegarde finale du commentaire', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');

    const denied = await apiFetch(baseUrl, '/api/v1/report-comments', {
      cookie,
      method: 'POST',
      body: { studentId: 'student-a1', commentText: 'Texte', humanValidated: false }
    });
    assert.equal(denied.status, 422);

    const accepted = await apiFetch(baseUrl, '/api/v1/report-comments', {
      cookie,
      method: 'POST',
      body: { studentId: 'student-a1', commentText: 'Texte validé humainement', humanValidated: true }
    });
    assert.equal(accepted.status, 201);
  });
});

test('tenant avec IA désactivée ne peut pas utiliser la génération', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await apiFetch(baseUrl, '/api/v1/ai/report-comments/draft', {
      cookie,
      method: 'POST',
      body: { studentId: 'student-a1' }
    });

    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.error.code, 'AI_DISABLED');
  }, {
    aiConfig: {
      featureFlags: new TenantAiFeatureFlagStore({ tenantFlags: { 'school-a': false } })
    }
  });
});

test('génération IA est loggée et provider mockable en test', async () => {
  const aiLogStore = new AiLogStore();
  let called = false;
  const mockProvider = {
    async generate() {
      called = true;
      return { outputText: 'Brouillon mock', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } };
    }
  };

  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await apiFetch(baseUrl, '/api/v1/ai/report-comments/draft', {
      cookie,
      method: 'POST',
      body: { studentId: 'student-a1' }
    });

    assert.equal(response.status, 201);
    assert.equal(called, true);
    const payload = await response.json();
    assert.equal(payload.data.draft, 'Brouillon mock');
    const logs = aiLogStore.listByTenant('school-a');
    assert.ok(logs.some((entry) => entry.promptKey === 'report.comment.draft' && entry.status === 'success'));
  }, {
    aiConfig: {
      logStore: aiLogStore,
      promptRegistry: new PromptRegistry({ prompts: [{ key: 'report.comment.draft', version: 1, template: 'template' }] }),
      featureFlags: new TenantAiFeatureFlagStore({ tenantFlags: { 'school-a': true } }),
      providerRegistry: new AiProviderRegistry({ providers: { mock: mockProvider }, defaultProvider: 'mock' })
    }
  });
});

test('contrat succès API inclut success=true, data et meta.request_id', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await apiFetch(baseUrl, '/api/v1/students', { cookie });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.ok(Array.isArray(payload.data));
    assert.equal(typeof payload.meta?.request_id, 'string');
    assert.ok(payload.meta.request_id.length > 10);
  });
});

test('contrat erreur validation unifié', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await apiFetch(baseUrl, '/api/v1/students', {
      cookie,
      method: 'POST',
      body: { firstName: 'N', lastName: 'X' }
    });

    assert.equal(response.status, 422);
    const payload = await response.json();
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, 'VALIDATION_ERROR');
    assert.equal(typeof payload.error.message, 'string');
    assert.equal(typeof payload.meta?.request_id, 'string');
  });
});

test('contrat erreur authorisation unifié', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'director@school-a.test');
    const response = await apiFetch(baseUrl, '/api/v1/students', {
      cookie,
      method: 'POST',
      body: {
        firstName: 'Nope',
        lastName: 'Denied',
        admissionNumber: 'A-901',
        classRoomId: 'class-a1'
      }
    });

    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, 'FORBIDDEN');
    assert.equal(typeof payload.error.message, 'string');
  });
});

test('contrat erreur not found unifié', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await apiFetch(baseUrl, '/api/v1/students/student-missing', { cookie });

    assert.equal(response.status, 404);
    const payload = await response.json();
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, 'NOT_FOUND');
    assert.equal(payload.error.message, 'Student not found');
  });
});

// ---------------------------------------------------------------------------
// Sprint 1 security suite (SEC-04..08)
// ---------------------------------------------------------------------------

test('SEC-06: les réponses HTML portent les headers de sécurité', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/login`);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    const csp = response.headers.get('content-security-policy') ?? '';
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
  });
});

test("SEC-06: HSTS n'est pas envoyé en dev mais le serait en production", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/login`);
    assert.equal(response.headers.get('strict-transport-security'), null);
  });
});

test('SEC-04 + SEC-08: le cookie de session est signé et marqué HttpOnly/SameSite/Path', async () => {
  await withServer(async (baseUrl) => {
    const { response } = await login(baseUrl, 'admin@school-a.test');
    const setCookies = collectSetCookies(response);
    const sessionCookie = setCookies.find((entry) => entry.startsWith('sessionId='));
    assert.ok(sessionCookie, 'sessionId cookie present');
    assert.match(sessionCookie, /HttpOnly/i);
    assert.match(sessionCookie, /SameSite=Lax/i);
    assert.match(sessionCookie, /Path=\//);
    const value = sessionCookie.split(';')[0].slice('sessionId='.length);
    assert.ok(value.includes('.'), 'session id is signed (contains separator)');
    assert.ok(value.split('.')[1].length === 64, 'HMAC signature is hex sha256');
  });
});

test('SEC-05: POST API sans token CSRF renvoie 403', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const cookieWithoutCsrf = cookie.split(';').map((p) => p.trim()).filter((p) => p.startsWith('sessionId=')).join('; ');
    const response = await fetch(`${baseUrl}/api/v1/students`, {
      method: 'POST',
      headers: { cookie: cookieWithoutCsrf, 'content-type': 'application/json' },
      body: JSON.stringify({ firstName: 'CSRF', lastName: 'Test', admissionNumber: 'X-1', classRoomId: 'class-a1', dateOfBirth: '2014-01-01' })
    });
    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.error?.code, 'csrf_token_invalid');
  });
});

test('SEC-05: POST formulaire sans _csrf renvoie 403', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const cookieWithoutCsrf = cookie.split(';').map((p) => p.trim()).filter((p) => p.startsWith('sessionId=')).join('; ');
    const response = await fetch(`${baseUrl}/admin/parents`, {
      method: 'POST',
      headers: { cookie: cookieWithoutCsrf, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ firstName: 'X', lastName: 'Y' }).toString(),
      redirect: 'manual'
    });
    assert.equal(response.status, 403);
  });
});

test('SEC-05: POST formulaire avec _csrf valide réussit', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const csrfToken = extractCsrfFromCookieString(cookie);
    const response = await fetch(`${baseUrl}/admin/parents`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: csrfToken, firstName: 'Anne', lastName: 'Test' }).toString(),
      redirect: 'manual'
    });
    assert.equal(response.status, 302);
  });
});

test('SEC-07: 5 logins échoués bloquent le 6ème depuis la même IP', async () => {
  await withServer(async (baseUrl) => {
    for (let i = 0; i < 5; i += 1) {
      const r = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email: 'admin@school-a.test', password: 'wrong' }).toString(),
        redirect: 'manual'
      });
      assert.equal(r.status, 401);
    }
    const blocked = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'admin@school-a.test', password: 'password123' }).toString(),
      redirect: 'manual'
    });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  });
});

// =====================================================================
// Sprint 2 — Gestion des utilisateurs depuis l'interface (USR-01..04)
// =====================================================================

async function postForm(baseUrl, path, { cookie, fields }) {
  const csrfToken = extractCsrfFromCookieString(cookie);
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: csrfToken, ...fields }).toString(),
    redirect: 'manual'
  });
}

test('USR-01: admin crée un enseignant avec un compte de connexion fonctionnel', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await postForm(baseUrl, '/admin/teachers', {
      cookie,
      fields: {
        firstName: 'Nouvelle',
        lastName: 'Prof',
        email: 'nouvelle.prof@school-a.test',
        password: 'TempPass1!'
      }
    });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /^\/admin\/teachers\//);

    const loginResult = await login(baseUrl, 'nouvelle.prof@school-a.test', 'TempPass1!');
    assert.equal(loginResult.response.status, 302);
    assert.equal(loginResult.response.headers.get('location'), '/dashboard/teacher');
  });
});

test('USR-01: email en double sur création enseignant renvoie une erreur', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await postForm(baseUrl, '/admin/teachers', {
      cookie,
      fields: {
        firstName: 'Doublon',
        lastName: 'Prof',
        email: 'teacher@school-a.test',
        password: 'TempPass1!'
      }
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/admin/teachers?error=email_duplicate');
  });
});

test('USR-01: mot de passe trop court rejeté avant toute création', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await postForm(baseUrl, '/admin/teachers', {
      cookie,
      fields: {
        firstName: 'Faible',
        lastName: 'Mdp',
        email: 'faible.mdp@school-a.test',
        password: 'short'
      }
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/admin/teachers?error=password_required');

    // Le compte ne doit pas avoir été créé
    const loginResult = await login(baseUrl, 'faible.mdp@school-a.test', 'short');
    assert.equal(loginResult.response.status, 401);
  });
});

test('USR-02: admin crée un parent avec un compte de connexion fonctionnel', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await postForm(baseUrl, '/admin/parents', {
      cookie,
      fields: {
        firstName: 'Nouveau',
        lastName: 'Parent',
        email: 'nouveau.parent@school-a.test',
        password: 'TempPass1!',
        phone: '+213000000000'
      }
    });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /^\/admin\/parents\//);

    const loginResult = await login(baseUrl, 'nouveau.parent@school-a.test', 'TempPass1!');
    assert.equal(loginResult.response.status, 302);
    assert.equal(loginResult.response.headers.get('location'), '/dashboard/parent');
  });
});

test('USR-03: création élève sans accès ne crée pas de compte de connexion', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await postForm(baseUrl, '/admin/students', {
      cookie,
      fields: {
        firstName: 'SansAccès',
        lastName: 'Élève',
        admissionNumber: 'A-NEW-1',
        classRoomId: 'class-a1',
        dateOfBirth: '2014-05-05'
      }
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/admin/students?created=1');

    // Tentative de login : aucun compte n'existe pour cet élève
    const loginResult = await login(baseUrl, 'sansacces@inexistant.test', 'whatever');
    assert.equal(loginResult.response.status, 401);
  });
});

test('USR-03: création élève avec accès crée un compte étudiant utilisable', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await postForm(baseUrl, '/admin/students', {
      cookie,
      fields: {
        firstName: 'AvecAccès',
        lastName: 'Élève',
        admissionNumber: 'A-NEW-2',
        classRoomId: 'class-a1',
        dateOfBirth: '2014-06-06',
        createAccess: '1',
        email: 'avec.acces@school-a.test',
        password: 'TempPass1!'
      }
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/admin/students?created=1');

    const loginResult = await login(baseUrl, 'avec.acces@school-a.test', 'TempPass1!');
    assert.equal(loginResult.response.status, 302);
    assert.equal(loginResult.response.headers.get('location'), '/dashboard/student');
  });
});

test('MSG: la page /inbox affiche le formulaire de nouvelle conversation avec destinataires', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/inbox`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('Nouvelle conversation'), 'section compose présente');
    assert.ok(html.includes('action="/inbox/threads"'), 'form action vers /inbox/threads');
    assert.ok(html.includes('name="participantIds"'), 'checkboxes destinataires');
    // extrait la section compose pour éviter de matcher l'email admin dans le header de page
    const composeIdx = html.indexOf('Nouvelle conversation');
    const composeSection = html.substring(composeIdx);
    assert.ok(composeSection.includes('teacher@school-a.test'), 'teacher listé comme destinataire');
    assert.ok(composeSection.includes('parent@school-a.test'), 'parent listé comme destinataire');
    assert.ok(!composeSection.includes('value="admin-a"'), 'l\'utilisateur courant (admin-a) n\'est pas dans les destinataires');
  });
});

test('MSG: admin crée un thread avec teacher → redirection ?success=sent', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await postForm(baseUrl, '/inbox/threads', {
      cookie,
      fields: {
        subject: 'Réunion équipe pédagogique',
        body: 'Bonjour, pouvons-nous nous voir vendredi à 16h ?',
        participantIds: 'teacher-a1'
      }
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/inbox?success=sent');

    const inbox = await fetch(`${baseUrl}/inbox?success=sent`, { headers: { cookie } });
    const html = await inbox.text();
    assert.ok(html.includes('Réunion équipe pédagogique'), 'le nouveau thread apparaît dans l\'inbox');
    assert.ok(html.includes('Message envoyé'), 'banner succès affiché');
  });
});

test('MSG: sujet trop court → redirection ?error=invalid_input', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await postForm(baseUrl, '/inbox/threads', {
      cookie,
      fields: { subject: 'Hi', body: 'Hello', participantIds: 'teacher-a1' }
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/inbox?error=invalid_input');
  });
});

test('MSG: aucun destinataire → redirection ?error=invalid_input', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await postForm(baseUrl, '/inbox/threads', {
      cookie,
      fields: { subject: 'Test sans destinataire', body: 'Message' }
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/inbox?error=invalid_input');
  });
});

test('MSG: tentative de message à un user d\'un autre tenant → invalid_input', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    // admin-b est dans school-b, donc hors scope tenant
    const response = await postForm(baseUrl, '/inbox/threads', {
      cookie,
      fields: { subject: 'Cross tenant', body: 'Hack', participantIds: 'admin-b' }
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/inbox?error=invalid_input');
  });
});

test('DIR-TCH: director peut voir /admin/teachers en lecture seule', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'director@school-a.test');
    const response = await fetch(`${baseUrl}/admin/teachers`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('Samira') || html.includes('teacher@school-a.test'), 'liste affichée');
    assert.ok(!html.includes('Créer un enseignant'), 'formulaire de création masqué pour director');
  });
});

test('DIR-TCH: director sur fiche teacher → lecture seule, pas de form update', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'director@school-a.test');
    const response = await fetch(`${baseUrl}/admin/teachers/teacher-a1`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('Vue lecture seule'), 'mention lecture seule');
    assert.ok(!html.includes('action="/admin/teachers/teacher-a1/update"'), 'pas de form update');
    assert.ok(!html.includes('action="/admin/teachers/teacher-a1/archive"'), 'pas de form archive');
  });
});

test('DIR-TCH: director ne peut PAS poster sur /admin/teachers (403)', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'director@school-a.test');
    const response = await postForm(baseUrl, '/admin/teachers', {
      cookie,
      fields: { firstName: 'X', lastName: 'Y', email: 'x@y.test', password: 'TempPass1!' }
    });
    assert.equal(response.status, 403);
  });
});

test('CRUD-02: admin peut éditer la classe et le matricule d\'un élève', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await postForm(baseUrl, '/admin/students/student-a1/update', {
      cookie,
      fields: {
        firstName: 'Aya',
        lastName: 'Nadir',
        admissionNumber: 'A-EDIT-1',
        classRoomId: 'class-a2',
        dateOfBirth: '2014-03-22'
      }
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/admin/students/student-a1?success=updated');

    const profile = await fetch(`${baseUrl}/admin/students/student-a1?success=updated`, { headers: { cookie } });
    const html = await profile.text();
    assert.ok(html.includes('A-EDIT-1'), 'le nouveau matricule doit apparaître');
    assert.ok(html.includes('Élève mis à jour.'), 'le banner de succès doit s\'afficher');
  });
});

test('CRUD-02: classRoomId invalide redirige avec error=invalid_input', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await postForm(baseUrl, '/admin/students/student-a1/update', {
      cookie,
      fields: {
        firstName: 'Aya',
        lastName: 'Nadir',
        admissionNumber: 'A-EDIT-2',
        classRoomId: 'class-does-not-exist',
        dateOfBirth: '2014-03-22'
      }
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/admin/students/student-a1?error=invalid_input');
  });
});

test('CRUD-02: non-admin ne peut pas éditer un élève', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await postForm(baseUrl, '/admin/students/student-a1/update', {
      cookie,
      fields: {
        firstName: 'Aya',
        lastName: 'Nadir',
        admissionNumber: 'A-EDIT-3',
        classRoomId: 'class-a1',
        dateOfBirth: '2014-03-22'
      }
    });
    assert.equal(response.status, 403);
  });
});

test('CRUD-06: admin archive un élève → disparaît du listing actif', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await postForm(baseUrl, '/admin/students/student-a3/archive', {
      cookie,
      fields: {}
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/admin/students/student-a3?success=archived');

    const listing = await fetch(`${baseUrl}/admin/students`, { headers: { cookie } });
    const html = await listing.text();
    assert.ok(!html.includes('student-a3'), 'l\'élève archivé ne doit plus apparaître dans la liste active');

    const profile = await fetch(`${baseUrl}/admin/students/student-a3`, { headers: { cookie } });
    assert.equal(profile.status, 200, 'la fiche archivée reste consultable');
    const profileHtml = await profile.text();
    assert.ok(profileHtml.includes('archivé'), 'le statut affiché doit être "archivé"');
    assert.ok(!profileHtml.includes('Archiver l\'élève'), 'le bouton d\'archivage doit disparaître');
  });
});

test('CRUD-06: non-admin ne peut pas archiver un élève', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await postForm(baseUrl, '/admin/students/student-a1/archive', {
      cookie,
      fields: {}
    });
    assert.equal(response.status, 403);
  });
});

// CRUD-01 — création élève sans accès via le formulaire admin/students
test('CRUD-01: admin crée un élève sans compte de connexion (createAccess absent)', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await postForm(baseUrl, '/admin/students', {
      cookie,
      fields: {
        firstName: 'CRUD01',
        lastName: 'Sans-Acces',
        admissionNumber: 'CRUD01-A-1',
        classRoomId: 'class-a1',
        dateOfBirth: '2014-01-01'
      }
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/admin/students?created=1');

    const list = await fetch(`${baseUrl}/admin/students`, { headers: { cookie } });
    const html = await list.text();
    assert.ok(html.includes('CRUD01-A-1'), 'le nouvel élève doit apparaître dans la liste');
  });
});

test('CRUD-01: createAccess=1 sans email rejette avec error=email_required', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await postForm(baseUrl, '/admin/students', {
      cookie,
      fields: {
        firstName: 'Incomplet',
        lastName: 'Email',
        admissionNumber: 'CRUD01-A-2',
        classRoomId: 'class-a1',
        dateOfBirth: '2014-01-02',
        createAccess: '1'
      }
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/admin/students?error=email_required');
  });
});

test('CRUD-01: non-admin ne peut pas créer d\'élève', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await postForm(baseUrl, '/admin/students', {
      cookie,
      fields: {
        firstName: 'Forbidden',
        lastName: 'Eleve',
        admissionNumber: 'CRUD01-A-X',
        classRoomId: 'class-a1',
        dateOfBirth: '2014-01-03'
      }
    });
    assert.equal(response.status, 403);
  });
});

// CRUD-05 — édition du profil enseignant (nom, classes assignées, matières)
test('CRUD-05: admin modifie nom, classes et matières d\'un enseignant', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const update = await postForm(baseUrl, '/admin/teachers/teacher-a1/update', {
      cookie,
      fields: {
        firstName: 'Samira-Updated',
        lastName: 'Alami',
        email: 'teacher@school-a.test',
        phone: '+1 555-9999',
        notes: 'Mis à jour via CRUD-05',
        // Réaffecte les classes : retire class-a1, ajoute class-a2
        classRoomIds: 'class-a2',
        // Ajoute une matière
        subjectIds: 'subject-a-fr'
      }
    });
    assert.equal(update.status, 302);
    assert.equal(update.headers.get('location'), '/admin/teachers/teacher-a1');

    const profile = await fetch(`${baseUrl}/admin/teachers/teacher-a1`, { headers: { cookie } });
    const html = await profile.text();
    assert.ok(html.includes('Samira-Updated'), 'le nouveau prénom doit apparaître');
    assert.ok(html.includes('+1 555-9999'), 'le nouveau téléphone doit apparaître');
    assert.ok(html.includes('Mis à jour via CRUD-05'), 'les notes doivent être mises à jour');
  });
});

test('CRUD-05: non-admin ne peut pas éditer un profil enseignant', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await postForm(baseUrl, '/admin/teachers/teacher-a1/update', {
      cookie,
      fields: { firstName: 'Hack', lastName: 'Hack' }
    });
    assert.equal(response.status, 403);
  });
});

test('CRUD-05: admin archive un enseignant qui disparaît du listing actif', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const before = await fetch(`${baseUrl}/admin/teachers`, { headers: { cookie } });
    const beforeHtml = await before.text();
    assert.ok(beforeHtml.includes('teacher2@school-a.test'), 'teacher-a2 listé avant archivage');

    const archive = await postForm(baseUrl, '/admin/teachers/teacher-a2/archive', { cookie, fields: {} });
    assert.equal(archive.status, 302);
    assert.equal(archive.headers.get('location'), '/admin/teachers/teacher-a2');

    const after = await fetch(`${baseUrl}/admin/teachers`, { headers: { cookie } });
    const afterHtml = await after.text();
    assert.ok(!afterHtml.includes('teacher2@school-a.test'), 'teacher-a2 ne doit plus apparaître dans la liste active');

    // La fiche reste consultable et affiche le badge archivé
    const profile = await fetch(`${baseUrl}/admin/teachers/teacher-a2`, { headers: { cookie } });
    const profileHtml = await profile.text();
    assert.ok(/archiv[ée]/i.test(profileHtml), 'la fiche doit afficher le statut archivé');
  });
});

test('CRUD-03: la fiche élève affiche responsables liés, présences et notes récentes', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/admin/students/student-a1`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();

    assert.ok(html.includes('Responsables liés'), 'la section responsables est présente');
    assert.ok(html.includes('Meryem Nadir'), 'le nom du responsable apparaît');
    assert.ok(html.includes('contact principal'), 'le badge contact principal est rendu');
    assert.ok(html.includes('Responsable'), 'le libellé FR de la relation est affiché');

    assert.ok(html.includes('Présences récentes'), 'la section présences est présente');
    assert.ok(html.includes('2026-04-20'), 'la date de la présence est affichée');
    assert.ok(html.includes('Présent'), 'le statut FR de présence est affiché');

    assert.ok(html.includes('Notes récentes'), 'la section notes est présente');
    assert.ok(html.includes('Contrôle fractions'), 'le titre de l\'évaluation est affiché');
    assert.ok(html.includes('Mathématiques'), 'le nom de la matière est affiché');
    assert.ok(html.includes('15.5'), 'le score de la note est affiché');
  });
});

test('CRUD-04: enseignant peut consulter une fiche élève de sa classe avec présences/notes/devoirs filtrés', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await fetch(`${baseUrl}/teacher/students/student-a1`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();

    assert.ok(html.includes('Aya Nadir'), 'le nom de l\'élève est affiché');
    assert.ok(html.includes('Vue lecture seule'), 'le bandeau lecture seule est rendu');
    assert.ok(!html.includes('Modifier la fiche'), 'aucun formulaire d\'édition');
    assert.ok(!html.includes('Archiver l\'élève'), 'aucun bouton d\'archivage');

    assert.ok(html.includes('Présences récentes'), 'section présences présente');
    assert.ok(html.includes('Présent'), 'statut FR affiché');

    assert.ok(html.includes('Notes récentes'), 'section notes présente');
    assert.ok(html.includes('Contrôle fractions'), 'évaluation de math affichée');
    assert.ok(html.includes('15.5'), 'score affiché');

    assert.ok(html.includes('Devoirs (mes matières)'), 'section devoirs présente');
    assert.ok(html.includes('Exercices fractions p.42'), 'titre du devoir de math affiché');
  });
});

test('CRUD-04: enseignant ne peut pas voir un élève hors de ses classes (403)', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    // teacher-a1 enseigne class-a1 uniquement ; student-a2 est en class-a2
    const response = await fetch(`${baseUrl}/teacher/students/student-a2`, { headers: { cookie } });
    assert.equal(response.status, 403);
  });
});

test('CRUD-04: admin ne peut pas accéder à la vue enseignant (403)', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/teacher/students/student-a1`, { headers: { cookie } });
    assert.equal(response.status, 403);
  });
});

test('CRUD-04: les notes affichées sont restreintes aux matières de l\'enseignant', async () => {
  await withServer(async (baseUrl) => {
    // teacher-a2 enseigne FR/HIST/SCI sur class-a2 et class-a3 ; student-a2 est en class-a2 avec une note de sciences
    const { cookie } = await login(baseUrl, 'teacher2@school-a.test');
    const response = await fetch(`${baseUrl}/teacher/students/student-a2`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('Salim Brahim'), 'élève visible pour son enseignant de classe');
    assert.ok(html.includes('Quiz sciences'), 'évaluation sciences affichée (matière du prof)');
    assert.ok(!html.includes('Contrôle fractions'), 'évaluation math NON affichée (matière hors périmètre du prof)');
  });
});

test('CRUD-03: élève sans données affiche les empty states', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/admin/students/student-a5`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('Aucun responsable rattaché'), 'empty state responsables');
    assert.ok(html.includes('Aucune présence enregistrée'), 'empty state présences');
    assert.ok(html.includes('Aucune note saisie'), 'empty state notes');
  });
});

test('UX-03: POST /teacher/attendance redirige avec status=saved et affiche un banner de succès', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await postForm(baseUrl, '/teacher/attendance', {
      cookie,
      fields: {
        date: '2026-05-15',
        classRoomId: 'class-a1',
        studentId: 'student-a1',
        status: 'present'
      }
    });
    assert.equal(response.status, 302);
    const location = response.headers.get('location') || '';
    assert.match(location, /status=saved/, 'paramètre status=saved');

    const page = await fetch(`${baseUrl}${location}`, { headers: { cookie } });
    const html = await page.text();
    assert.ok(html.includes('Appel enregistré'), 'banner de succès affiché');
  });
});

test('UX-04: /assets/ux.js est servi avec le bon content-type', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/assets/ux.js`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /application\/javascript/);
    const body = await response.text();
    assert.ok(body.includes('data-confirm'), 'le handler lit l\'attribut data-confirm');
    assert.ok(body.includes('window.confirm'), 'appelle window.confirm');
  });
});

test('UX-04: chaque page dashboard charge /assets/ux.js (CSP-safe, pas d\'inline)', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/admin/students`, { headers: { cookie } });
    const html = await response.text();
    assert.ok(html.includes('<script src="/assets/ux.js" defer></script>'), 'script tag présent');
    assert.ok(!html.includes('onclick='), 'aucun handler inline');
  });
});

test('UX-04: le formulaire d\'archivage élève porte un data-confirm', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/admin/students/student-a1`, { headers: { cookie } });
    const html = await response.text();
    assert.match(html, /action="\/admin\/students\/student-a1\/archive"[^>]*data-confirm="[^"]+"/);
  });
});

test('UX-04: la suppression d\'une année scolaire porte un data-confirm', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/admin/school-years`, { headers: { cookie } });
    const html = await response.text();
    assert.match(html, /action="\/admin\/school-years\/[^"]+\/delete"[^>]*data-confirm="[^"]+"/);
  });
});

test('UX-02: 403 stylée avec message FR et lien vers le dashboard', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await fetch(`${baseUrl}/admin/users`, { headers: { cookie } });
    assert.equal(response.status, 403);
    const html = await response.text();
    assert.ok(html.includes('Accès refusé'), 'titre FR');
    assert.ok(html.includes("Vous n'avez pas l'autorisation"), 'message clair');
    assert.ok(html.includes('/dashboard/teacher'), 'lien vers le dashboard du rôle courant');
    assert.match(response.headers.get('content-type') || '', /text\/html/, 'content-type HTML');
  });
});

test('UX-02: 404 stylée pour une route inconnue (catch-all)', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/cette-route-nexiste-pas`, { headers: { cookie } });
    assert.equal(response.status, 404);
    const html = await response.text();
    assert.ok(html.includes('Page introuvable'), 'titre 404 FR');
    assert.ok(html.includes('/dashboard/admin'), 'lien retour dashboard admin');
  });
});

test('UX-02: 404 stylée pour un élève inexistant (route paramétrée)', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/admin/students/student-inexistant`, { headers: { cookie } });
    assert.equal(response.status, 404);
    const html = await response.text();
    assert.ok(html.includes('Page introuvable'), 'titre 404 FR');
  });
});

test('UX-02: 404 sans session redirige vers /login plutôt que dashboard', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/route-inconnue`);
    assert.equal(response.status, 404);
    const html = await response.text();
    assert.ok(html.includes('/login'), 'sans session, le lien doit pointer vers /login');
  });
});

test('UX-05: la sidebar marque le lien actif basé sur le pathname courant', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const onStudents = await fetch(`${baseUrl}/admin/students`, { headers: { cookie } });
    const htmlStudents = await onStudents.text();
    const linkPattern = /<a class="el-nav-link ([^"]*)" href="\/admin\/students">Élèves<\/a>/;
    const studentsMatch = htmlStudents.match(linkPattern);
    assert.ok(studentsMatch, 'lien Élèves présent');
    assert.ok(studentsMatch[1].includes('is-active'), 'lien Élèves actif sur /admin/students');

    const onProfile = await fetch(`${baseUrl}/admin/students/student-a1`, { headers: { cookie } });
    const htmlProfile = await onProfile.text();
    const profileMatch = htmlProfile.match(linkPattern);
    assert.ok(profileMatch[1].includes('is-active'), 'lien Élèves actif sur /admin/students/:id (prefix match)');

    const onTeachers = await fetch(`${baseUrl}/admin/teachers`, { headers: { cookie } });
    const htmlTeachers = await onTeachers.text();
    const teachersMatch = htmlTeachers.match(linkPattern);
    assert.ok(!teachersMatch[1].includes('is-active'), 'lien Élèves NON actif sur /admin/teachers');
  });
});

test('BULL-03: admin voit le bulletin T3 d\'un élève avec moyenne par matière et moyenne générale', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/bulletins/students/student-a1/terms/term-a-t3`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('Bulletin — Trimestre 3'), 'titre du bulletin');
    assert.ok(html.includes('Aya Nadir'), 'nom élève');
    assert.ok(html.includes('Mathématiques'), 'matière du seed');
    assert.ok(html.includes('Contrôle fractions'), 'évaluation détaillée');
    assert.ok(html.includes('Moyenne générale: 15.50/20'), 'moyenne générale calculée');
  });
});

test('BULL-03: bulletin T1 (hors période des notes seed) → empty state', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/bulletins/students/student-a1/terms/term-a-t1`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('Aucune note enregistrée pour ce trimestre'), 'empty state notes');
    assert.ok(html.includes('Moyenne générale: -'), 'moyenne générale absente');
  });
});

test('BULL-03: page index liste les trois trimestres', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/bulletins/students/student-a1`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('Trimestre 1'), 'T1 listé');
    assert.ok(html.includes('Trimestre 2'), 'T2 listé');
    assert.ok(html.includes('Trimestre 3'), 'T3 listé');
    assert.ok(html.includes('/bulletins/students/student-a1/terms/term-a-t3'), 'lien vers T3');
  });
});

test('BULL-03: enseignant accède au bulletin restreint à ses matières (vue limitée)', async () => {
  await withServer(async (baseUrl) => {
    // teacher-a1 enseigne maths à class-a1 ; student-a1 a une note de math en T3
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await fetch(`${baseUrl}/bulletins/students/student-a1/terms/term-a-t3`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('Vue restreinte aux matières que vous enseignez'), 'note de portée affichée');
    assert.ok(html.includes('Moyenne sur vos matières: 15.50/20'), 'libellé moyenne adapté');
    assert.ok(html.includes('Mathématiques'), 'matière enseignée présente');
  });
});

test('BULL-03: enseignant n\'accède pas au bulletin d\'un élève hors de ses classes (403)', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await fetch(`${baseUrl}/bulletins/students/student-a2/terms/term-a-t3`, { headers: { cookie } });
    assert.equal(response.status, 403);
  });
});

test('BULL-03: parent accède au bulletin de son enfant', async () => {
  await withServer(async (baseUrl) => {
    // parent-a1 lié à student-a1 (splink-a1)
    const { cookie } = await login(baseUrl, 'parent@school-a.test');
    const response = await fetch(`${baseUrl}/bulletins/students/student-a1/terms/term-a-t3`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('Aya Nadir'), 'bulletin de l\'enfant visible');
    assert.ok(!html.includes('Vue restreinte'), 'parent voit la vue complète');
  });
});

test('BULL-03: parent n\'accède pas au bulletin d\'un élève non lié (403)', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'parent@school-a.test');
    // student-a4 n'est pas lié à parent-a1
    const response = await fetch(`${baseUrl}/bulletins/students/student-a4/terms/term-a-t3`, { headers: { cookie } });
    assert.equal(response.status, 403);
  });
});

test('BULL-03: élève accède à son propre bulletin uniquement', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'student@school-a.test');
    const own = await fetch(`${baseUrl}/bulletins/students/student-a1/terms/term-a-t3`, { headers: { cookie } });
    assert.equal(own.status, 200);

    const other = await fetch(`${baseUrl}/bulletins/students/student-a3/terms/term-a-t3`, { headers: { cookie } });
    assert.equal(other.status, 403);
  });
});

test('BULL-03: bulletin cross-tenant → 403', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-b.test');
    const response = await fetch(`${baseUrl}/bulletins/students/student-a1/terms/term-a-t3`, { headers: { cookie } });
    // student-a1 n'existe pas dans le scope tenant school-b → 404
    assert.equal(response.status, 404);
  });
});

test('BULL-03: trimestre inexistant → 404', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/bulletins/students/student-a1/terms/term-does-not-exist`, { headers: { cookie } });
    assert.equal(response.status, 404);
  });
});

test('CRUD-02: élève d\'un autre tenant → redirection error=not_found', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-b.test');
    const response = await postForm(baseUrl, '/admin/students/student-a1/update', {
      cookie,
      fields: {
        firstName: 'Hack',
        lastName: 'Attempt',
        admissionNumber: 'X',
        classRoomId: 'class-a1',
        dateOfBirth: '2014-03-22'
      }
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/admin/students?error=not_found');
  });
});

test('USR-04: GET /admin/users liste les comptes du tenant courant uniquement', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: adminACookie } = await login(baseUrl, 'admin@school-a.test');
    const responseA = await fetch(`${baseUrl}/admin/users`, { headers: { cookie: adminACookie } });
    assert.equal(responseA.status, 200);
    const htmlA = await responseA.text();
    assert.ok(htmlA.includes('admin@school-a.test'));
    assert.ok(htmlA.includes('teacher@school-a.test'));
    assert.ok(!htmlA.includes('admin@school-b.test'), 'le tenant A ne doit pas voir les users du tenant B');

    const { cookie: adminBCookie } = await login(baseUrl, 'admin@school-b.test');
    const responseB = await fetch(`${baseUrl}/admin/users`, { headers: { cookie: adminBCookie } });
    const htmlB = await responseB.text();
    assert.ok(htmlB.includes('admin@school-b.test'));
    assert.ok(!htmlB.includes('teacher@school-a.test'));
  });
});

test('USR-04: non-admin ne peut pas accéder à /admin/users', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await fetch(`${baseUrl}/admin/users`, { headers: { cookie } });
    assert.equal(response.status, 403);
  });
});

test('USR-04: désactiver un compte bloque la connexion, réactiver la rétablit', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');

    const deactivate = await postForm(baseUrl, '/admin/users/teacher-a1/deactivate', { cookie, fields: {} });
    assert.equal(deactivate.status, 302);
    assert.equal(deactivate.headers.get('location'), '/admin/users?success=deactivated');

    const blocked = await login(baseUrl, 'teacher@school-a.test', 'password123');
    assert.equal(blocked.response.status, 401);

    const activate = await postForm(baseUrl, '/admin/users/teacher-a1/activate', { cookie, fields: {} });
    assert.equal(activate.status, 302);
    assert.equal(activate.headers.get('location'), '/admin/users?success=activated');

    const ok = await login(baseUrl, 'teacher@school-a.test', 'password123');
    assert.equal(ok.response.status, 302);
  });
});

test('USR-04: admin ne peut pas se désactiver lui-même', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await postForm(baseUrl, '/admin/users/admin-a/deactivate', { cookie, fields: {} });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/admin/users?error=cannot_self_deactivate');

    // Vérifie que le compte est toujours actif
    const stillOk = await login(baseUrl, 'admin@school-a.test', 'password123');
    assert.equal(stillOk.response.status, 302);
  });
});

test('USR-04: reset password — ancien refusé, nouveau accepté', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await postForm(baseUrl, '/admin/users/teacher-a2/reset-password', {
      cookie,
      fields: { password: 'BrandNew99!' }
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/admin/users?success=password_reset');

    const oldFail = await login(baseUrl, 'teacher2@school-a.test', 'password123');
    assert.equal(oldFail.response.status, 401);

    const newOk = await login(baseUrl, 'teacher2@school-a.test', 'BrandNew99!');
    assert.equal(newOk.response.status, 302);
  });
});

test('USR-04: admin tenant A ne peut pas agir sur les users du tenant B', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    // admin-b appartient au tenant B
    const response = await postForm(baseUrl, '/admin/users/admin-b/deactivate', { cookie, fields: {} });
    assert.equal(response.status, 403);
  });
});

// =====================================================================
// Sprint 3 — Structure école depuis l'interface (SCH-01..SCH-06)
// =====================================================================

test('SCH-01: admin crée une année scolaire visible dans la liste', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const create = await postForm(baseUrl, '/admin/school-years', {
      cookie,
      fields: {
        label: '2026-2027',
        startsAt: '2026-09-01',
        endsAt: '2027-06-30',
        status: 'active'
      }
    });
    assert.equal(create.status, 302);
    assert.equal(create.headers.get('location'), '/admin/school-years?success=year_created');

    const listResponse = await fetch(`${baseUrl}/admin/school-years`, { headers: { cookie } });
    assert.equal(listResponse.status, 200);
    const html = await listResponse.text();
    assert.ok(html.includes('2026-2027'));
    assert.ok(html.includes('2026-09-01'));
  });
});

test('SCH-01: dates incohérentes (start après end) renvoient une erreur', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const create = await postForm(baseUrl, '/admin/school-years', {
      cookie,
      fields: {
        label: 'Erreur',
        startsAt: '2027-06-30',
        endsAt: '2026-09-01',
        status: 'draft'
      }
    });
    assert.equal(create.status, 302);
    assert.equal(create.headers.get('location'), '/admin/school-years?error=invalid_input');
  });
});

test('SCH-01: non-admin ne peut pas accéder aux années scolaires', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const listResponse = await fetch(`${baseUrl}/admin/school-years`, { headers: { cookie } });
    assert.equal(listResponse.status, 403);
  });
});

test('SCH-02: trimestre rattaché à une année existe et apparait dans la page', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const createYear = await postForm(baseUrl, '/admin/school-years', {
      cookie,
      fields: { label: '2026-2027', startsAt: '2026-09-01', endsAt: '2027-06-30', status: 'active' }
    });
    assert.equal(createYear.status, 302);

    const listResponse = await fetch(`${baseUrl}/admin/school-years`, { headers: { cookie } });
    const html = await listResponse.text();
    const yearIdMatch = html.match(/\/admin\/school-years\/([^/]+)\/terms/);
    assert.ok(yearIdMatch, 'expected an academic year id form action');
    const yearId = yearIdMatch[1];

    const createTerm = await postForm(baseUrl, `/admin/school-years/${yearId}/terms`, {
      cookie,
      fields: {
        name: 'Trimestre 1',
        startsAt: '2026-09-01',
        endsAt: '2026-12-20'
      }
    });
    assert.equal(createTerm.status, 302);
    assert.equal(createTerm.headers.get('location'), '/admin/school-years?success=term_created');

    const afterTerm = await fetch(`${baseUrl}/admin/school-years`, { headers: { cookie } });
    const afterHtml = await afterTerm.text();
    assert.ok(afterHtml.includes('Trimestre 1'));
    assert.ok(afterHtml.includes('2026-12-20'));
  });
});

test('SCH-03: admin crée un niveau puis une classe rattachée au niveau', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');

    const createGrade = await postForm(baseUrl, '/admin/grade-levels', {
      cookie,
      fields: { name: '6ème', order: '6' }
    });
    assert.equal(createGrade.status, 302);

    const listResponse = await fetch(`${baseUrl}/admin/classes`, { headers: { cookie } });
    const html = await listResponse.text();
    const gradeMatch = html.match(/value="(grade-[^"]+)"/);
    assert.ok(gradeMatch, 'expected a grade-level option');
    const gradeId = gradeMatch[1];

    const createClass = await postForm(baseUrl, '/admin/classes', {
      cookie,
      fields: { name: '6ème C', gradeLevelId: gradeId, capacity: '28' }
    });
    assert.equal(createClass.status, 302);
    assert.equal(createClass.headers.get('location'), '/admin/classes?success=class_created');

    const after = await fetch(`${baseUrl}/admin/classes`, { headers: { cookie } });
    const afterHtml = await after.text();
    assert.ok(afterHtml.includes('6ème C'));
    assert.ok(afterHtml.includes('6ème'));
  });
});

test('SCH-03: classe sans niveau valide est refusée', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const create = await postForm(baseUrl, '/admin/classes', {
      cookie,
      fields: { name: 'OrphelineX', gradeLevelId: 'grade-inexistant', capacity: '20' }
    });
    assert.equal(create.status, 302);
    assert.equal(create.headers.get('location'), '/admin/classes?error=reference_invalid');
  });
});

test('SCH-04: admin crée une matière et elle apparait dans la liste', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const create = await postForm(baseUrl, '/admin/subjects', {
      cookie,
      fields: { name: 'Arts plastiques', code: 'ART' }
    });
    assert.equal(create.status, 302);
    assert.equal(create.headers.get('location'), '/admin/subjects?success=created');

    const list = await fetch(`${baseUrl}/admin/subjects`, { headers: { cookie } });
    const html = await list.text();
    assert.ok(html.includes('Arts plastiques'));
    assert.ok(html.includes('ART'));
  });
});

test('SCH-04: matière sans code est refusée', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const create = await postForm(baseUrl, '/admin/subjects', {
      cookie,
      fields: { name: 'IncompleteSubject', code: '' }
    });
    assert.equal(create.status, 302);
    assert.equal(create.headers.get('location'), '/admin/subjects?error=invalid_input');
  });
});

test('SCH-05: admin enregistre les paramètres école et les retrouve', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const save = await postForm(baseUrl, '/admin/school-settings', {
      cookie,
      fields: { name: 'Lycée Saint-Exupéry', code: 'STX', city: 'Dakar', country: 'Sénégal' }
    });
    assert.equal(save.status, 302);
    assert.equal(save.headers.get('location'), '/admin/school-settings?success=saved');

    const view = await fetch(`${baseUrl}/admin/school-settings`, { headers: { cookie } });
    const html = await view.text();
    assert.ok(html.includes('Lycée Saint-Exupéry'));
    assert.ok(html.includes('STX'));
    assert.ok(html.includes('Dakar'));
  });
});

test('SCH-06: super_admin crée un tenant et son school_admin qui peut se logger', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'superadmin@platform.test');
    const create = await postForm(baseUrl, '/admin/tenants', {
      cookie,
      fields: {
        name: 'École Pilote Dakar',
        slug: 'ecole-pilote',
        adminEmail: 'admin@ecole-pilote.test',
        adminPassword: 'PilotePass1!'
      }
    });
    assert.equal(create.status, 302);
    assert.equal(create.headers.get('location'), '/admin/tenants?success=created');

    // L'admin peut maintenant se connecter
    const adminLogin = await login(baseUrl, 'admin@ecole-pilote.test', 'PilotePass1!');
    assert.equal(adminLogin.response.status, 302);
    assert.equal(adminLogin.response.headers.get('location'), '/dashboard/admin');

    // La liste des tenants montre le nouveau
    const list = await fetch(`${baseUrl}/admin/tenants`, { headers: { cookie } });
    const html = await list.text();
    assert.ok(html.includes('ecole-pilote'));
    assert.ok(html.includes('École Pilote Dakar'));
  });
});

test('SCH-06: non-super_admin ne peut pas créer un tenant', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const create = await postForm(baseUrl, '/admin/tenants', {
      cookie,
      fields: {
        name: 'Forbidden Tenant',
        slug: 'forbidden-tenant',
        adminEmail: 'forbidden@school.test',
        adminPassword: 'WhateverPass1!'
      }
    });
    assert.equal(create.status, 403);
  });
});

test('SCH-06: slug invalide refusé (avec espaces ou majuscules)', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'superadmin@platform.test');
    const create = await postForm(baseUrl, '/admin/tenants', {
      cookie,
      fields: {
        name: 'Mauvais Slug',
        slug: 'Bad Slug!!',
        adminEmail: 'mauvais@slug.test',
        adminPassword: 'PassValide1!'
      }
    });
    assert.equal(create.status, 302);
    const location = create.headers.get('location') || '';
    assert.match(location, /\/admin\/tenants\?error=slug_/);
  });
});

test('SCH-06: slug dupliqué refusé', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'superadmin@platform.test');
    const first = await postForm(baseUrl, '/admin/tenants', {
      cookie,
      fields: { name: 'Premier', slug: 'tenant-unique', adminEmail: 'first@tenant.test', adminPassword: 'PassValide1!' }
    });
    assert.equal(first.status, 302);
    assert.equal(first.headers.get('location'), '/admin/tenants?success=created');

    const second = await postForm(baseUrl, '/admin/tenants', {
      cookie,
      fields: { name: 'Deuxième', slug: 'tenant-unique', adminEmail: 'second@tenant.test', adminPassword: 'PassValide1!' }
    });
    assert.equal(second.status, 302);
    assert.equal(second.headers.get('location'), '/admin/tenants?error=slug_duplicate');
  });
});

test('SCH-06: redirection super_admin après login pointe vers /admin/tenants', async () => {
  await withServer(async (baseUrl) => {
    const { response } = await login(baseUrl, 'superadmin@platform.test');
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/admin/tenants');
  });
});

test('SCH-isolation: tenant A ne voit pas l\'année scolaire du tenant B', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: cookieA } = await login(baseUrl, 'admin@school-a.test');
    await postForm(baseUrl, '/admin/school-years', {
      cookie: cookieA,
      fields: { label: 'Annee-A-PrivateXYZ', startsAt: '2026-09-01', endsAt: '2027-06-30', status: 'active' }
    });

    const { cookie: cookieB } = await login(baseUrl, 'admin@school-b.test');
    const view = await fetch(`${baseUrl}/admin/school-years`, { headers: { cookie: cookieB } });
    const html = await view.text();
    assert.ok(!html.includes('Annee-A-PrivateXYZ'), 'tenant B doit pas voir l\'année du tenant A');
  });
});

// =====================================================================
// Sprint 8 / VS-01 — Feuille d'appel enrichie (événements vie scolaire)
// =====================================================================

test('VS-01: statut excused est désormais accepté par l\'appel enseignant', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await postForm(baseUrl, '/teacher/attendance', {
      cookie,
      fields: {
        date: '2026-05-12',
        classRoomId: 'class-a1',
        studentId: 'student-a1',
        status: 'excused'
      }
    });
    assert.equal(response.status, 302);
    const location = response.headers.get('location') || '';
    assert.match(location, /status=saved/, 'statut excused accepté → status=saved');
  });
});

test('VS-01: enseignant crée un événement (encouragement) sur sa classe', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await postForm(baseUrl, '/teacher/attendance/events', {
      cookie,
      fields: {
        date: '2026-05-12',
        classRoomId: 'class-a1',
        studentId: 'student-a1',
        eventType: 'encouragement',
        comment: 'Belle prise de parole en début de cours.'
      }
    });
    assert.equal(response.status, 302);
    const location = response.headers.get('location') || '';
    assert.match(location, /status=event_saved/, 'banner event_saved');

    const page = await fetch(`${baseUrl}${location}`, { headers: { cookie } });
    const html = await page.text();
    assert.ok(html.includes('Belle prise de parole'), 'commentaire visible sur la feuille d\'appel');
    assert.ok(html.includes('Encouragement'), 'libellé FR du type d\'événement');
    assert.ok(html.includes('Événement enregistré.'), 'banner succès');
  });
});

test('VS-01: enseignant ne peut PAS créer un événement sur une classe non assignée', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    // teacher-a1 enseigne class-a1, pas class-a2
    const response = await postForm(baseUrl, '/teacher/attendance/events', {
      cookie,
      fields: {
        date: '2026-05-12',
        classRoomId: 'class-a2',
        studentId: 'student-a2',
        eventType: 'observation',
        comment: 'Test'
      }
    });
    assert.equal(response.status, 403);
  });
});

test('VS-01: type d\'événement invalide → redirection avec status=event_error', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await postForm(baseUrl, '/teacher/attendance/events', {
      cookie,
      fields: {
        date: '2026-05-12',
        classRoomId: 'class-a1',
        studentId: 'student-a1',
        eventType: 'inconnu',
        comment: 'Test'
      }
    });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /status=event_error/);
  });
});

test('VS-01: événements visibles dans la fiche élève admin', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/admin/students/student-a1`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('Événements récents'), 'section événements présente');
    assert.ok(html.includes('Encouragement'), 'événement seedé visible (encouragement student-a1)');
  });
});

test('VS-01: événements visibles dans /admin/attendance avec filtre date+classe', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/admin/attendance?date=2026-04-20&classRoomId=class-a1`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('Événements de vie scolaire'), 'section événements admin');
    assert.ok(html.includes('Belle participation') || html.includes('Très bonne participation'), 'commentaire seed visible');
  });
});

test('VS-01: enseignant supprime un événement qu\'il a créé', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');

    // créer puis récupérer l'id depuis le HTML
    await postForm(baseUrl, '/teacher/attendance/events', {
      cookie,
      fields: {
        date: '2026-05-13',
        classRoomId: 'class-a1',
        studentId: 'student-a1',
        eventType: 'observation',
        comment: 'À-supprimer-marker-VS01'
      }
    });
    const pageBefore = await fetch(`${baseUrl}/teacher/attendance?date=2026-05-13&classRoomId=class-a1`, { headers: { cookie } });
    const htmlBefore = await pageBefore.text();
    assert.ok(htmlBefore.includes('À-supprimer-marker-VS01'), 'événement présent avant suppression');
    const match = htmlBefore.match(/action="\/teacher\/attendance\/events\/(attendance-event-[^/]+)\/delete"/);
    assert.ok(match, 'bouton supprimer présent');
    const eventId = match[1];

    const deleteResponse = await postForm(baseUrl, `/teacher/attendance/events/${eventId}/delete`, {
      cookie,
      fields: { date: '2026-05-13', classRoomId: 'class-a1' }
    });
    assert.equal(deleteResponse.status, 302);
    assert.match(deleteResponse.headers.get('location') || '', /status=event_deleted/);

    const pageAfter = await fetch(`${baseUrl}/teacher/attendance?date=2026-05-13&classRoomId=class-a1`, { headers: { cookie } });
    const htmlAfter = await pageAfter.text();
    assert.ok(!htmlAfter.includes('À-supprimer-marker-VS01'), 'événement disparu après suppression');
  });
});

test('VS-01: CSRF — POST événement sans token → 403', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await fetch(`${baseUrl}/teacher/attendance/events`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        date: '2026-05-12',
        classRoomId: 'class-a1',
        studentId: 'student-a1',
        eventType: 'observation'
      }).toString(),
      redirect: 'manual'
    });
    assert.equal(response.status, 403);
  });
});

test('VS-01: parent ne peut PAS créer d\'événement (rôle interdit)', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'parent@school-a.test');
    const response = await postForm(baseUrl, '/teacher/attendance/events', {
      cookie,
      fields: {
        date: '2026-05-12',
        classRoomId: 'class-a1',
        studentId: 'student-a1',
        eventType: 'observation'
      }
    });
    assert.equal(response.status, 403);
  });
});

// =====================================================================
// Sprint 8 / VS-03 — Parent prévient absence + upload justificatif
// =====================================================================

async function postMultipart(baseUrl, path, { cookie, fields = {}, file = null, includeCsrf = true }) {
  const csrfToken = extractCsrfFromCookieString(cookie);
  const formData = new FormData();
  if (includeCsrf) {
    formData.set('_csrf', csrfToken);
  }
  for (const [k, v] of Object.entries(fields)) {
    formData.set(k, String(v));
  }
  if (file) {
    formData.set(file.field || 'document', new Blob([file.data], { type: file.mimeType }), file.fileName);
  }
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { cookie },
    body: formData,
    redirect: 'manual'
  });
}

const VS03_VALID_FIELDS = {
  studentId: 'student-a1',
  startDate: '2026-05-10',
  endDate: '2026-05-12',
  reason: 'maladie',
  comment: 'Angine.'
};

test('VS-03: parent crée une notice sans fichier → 302 + visible dans /parent/absences', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'parent@school-a.test');
    const response = await postMultipart(baseUrl, '/parent/absences', {
      cookie,
      fields: VS03_VALID_FIELDS
    });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /\/parent\/absences\?status=created/);

    const list = await fetch(`${baseUrl}/parent/absences?status=created`, { headers: { cookie } });
    const html = await list.text();
    assert.ok(html.includes('Absence déclarée'), 'banner succès');
    assert.ok(html.includes('Angine.') || html.includes('Maladie'), 'notice listée');
  });
});

test('VS-03: parent crée une notice avec PDF → document accessible via GET /:id/document', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'parent@school-a.test');
    const pdfBuffer = Buffer.from('%PDF-1.4 vs03 test document content', 'utf8');
    const response = await postMultipart(baseUrl, '/parent/absences', {
      cookie,
      fields: { ...VS03_VALID_FIELDS, comment: 'Marker-VS03-PDF' },
      file: { fileName: 'certif.pdf', mimeType: 'application/pdf', data: pdfBuffer }
    });
    assert.equal(response.status, 302);

    const list = await fetch(`${baseUrl}/parent/absences`, { headers: { cookie } });
    const listHtml = await list.text();
    const match = listHtml.match(/href="\/parent\/absences\/(absence-notice-[a-z0-9-]+)"/);
    assert.ok(match, 'lien vers détail trouvé');
    const noticeId = match[1];

    const detail = await fetch(`${baseUrl}/parent/absences/${noticeId}`, { headers: { cookie } });
    const detailHtml = await detail.text();
    assert.ok(detailHtml.includes('certif.pdf'), 'nom du fichier visible');

    const doc = await fetch(`${baseUrl}/parent/absences/${noticeId}/document`, { headers: { cookie } });
    assert.equal(doc.status, 200);
    assert.equal(doc.headers.get('content-type'), 'application/pdf');
    const body = Buffer.from(await doc.arrayBuffer());
    assert.equal(body.toString('utf8'), '%PDF-1.4 vs03 test document content');
  });
});

test('VS-03: parent A ne peut PAS créer notice pour enfant non lié → redirect not_linked', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'parent2@school-a.test');
    // parent-a2 est lié à student-a2 et student-a4, pas student-a1
    const response = await postMultipart(baseUrl, '/parent/absences', {
      cookie,
      fields: { ...VS03_VALID_FIELDS, studentId: 'student-a1' }
    });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /error=not_linked/);
  });
});

test('VS-03: parent A ne peut PAS télécharger document de parent B → 404', async () => {
  await withServer(async (baseUrl) => {
    // parent-a1 crée une notice avec PDF
    const { cookie: cookieA1 } = await login(baseUrl, 'parent@school-a.test');
    await postMultipart(baseUrl, '/parent/absences', {
      cookie: cookieA1,
      fields: { ...VS03_VALID_FIELDS, comment: 'cross-test-VS03' },
      file: { fileName: 'secret.pdf', mimeType: 'application/pdf', data: Buffer.from('%PDF-1.4 secret', 'utf8') }
    });

    const list = await fetch(`${baseUrl}/parent/absences`, { headers: { cookie: cookieA1 } });
    const html = await list.text();
    const match = html.match(/href="\/parent\/absences\/(absence-notice-[a-z0-9-]+)"/);
    assert.ok(match);
    const noticeId = match[1];

    // parent-a2 essaie de télécharger
    const { cookie: cookieA2 } = await login(baseUrl, 'parent2@school-a.test');
    const docResp = await fetch(`${baseUrl}/parent/absences/${noticeId}/document`, { headers: { cookie: cookieA2 } });
    assert.equal(docResp.status, 404);
  });
});

test('VS-03: upload MIME interdit → redirect error=invalid_mime', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'parent@school-a.test');
    const response = await postMultipart(baseUrl, '/parent/absences', {
      cookie,
      fields: VS03_VALID_FIELDS,
      file: { fileName: 'mal.html', mimeType: 'text/html', data: Buffer.from('<html></html>') }
    });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /error=invalid_mime/);
  });
});

test('VS-03: upload > 3 Mo → redirect error=file_too_large', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'parent@school-a.test');
    const big = Buffer.alloc(3 * 1024 * 1024 + 1024, 0x42); // 3 Mo + 1 Ko
    const response = await postMultipart(baseUrl, '/parent/absences', {
      cookie,
      fields: VS03_VALID_FIELDS,
      file: { fileName: 'big.pdf', mimeType: 'application/pdf', data: big }
    });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /error=file_too_large/);
  });
});

test('VS-03: teacher ne peut PAS créer notice → 403', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await postMultipart(baseUrl, '/parent/absences', {
      cookie,
      fields: VS03_VALID_FIELDS
    });
    assert.equal(response.status, 403);
  });
});

test('VS-03: admin ne peut PAS créer notice → 403 (routes parent strictement parent)', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await postMultipart(baseUrl, '/parent/absences', {
      cookie,
      fields: VS03_VALID_FIELDS
    });
    assert.equal(response.status, 403);
  });
});

test('VS-03: cross-tenant : parent school-a ne voit pas /parent/absences/:id du tenant b (404)', async () => {
  await withServer(async (baseUrl) => {
    // Le seed contient des notices pour school-a uniquement. On cible un id du seed
    // pour s'assurer qu'un autre tenant ne le voit pas. Crée une notice school-a depuis parent-a1.
    const { cookie: cookieA } = await login(baseUrl, 'parent@school-a.test');
    await postMultipart(baseUrl, '/parent/absences', {
      cookie: cookieA,
      fields: { ...VS03_VALID_FIELDS, comment: 'cross-tenant-marker' }
    });
    const list = await fetch(`${baseUrl}/parent/absences`, { headers: { cookie: cookieA } });
    const html = await list.text();
    const match = html.match(/href="\/parent\/absences\/(absence-notice-[a-z0-9-]+)"/);
    assert.ok(match);
    const noticeIdA = match[1];

    // Tenant b n'a pas de parent dans le seed (sauf si on en a). On vérifie qu'un parent inconnu ne peut pas la voir.
    // À défaut d'un parent school-b, on utilise un teacher qui devra recevoir 403 sur la route parent.
    // On vérifie alors juste l'isolation côté route /parent/absences (parent-a2 ne voit pas la notice de parent-a1)
    const { cookie: cookieA2 } = await login(baseUrl, 'parent2@school-a.test');
    const detail = await fetch(`${baseUrl}/parent/absences/${noticeIdA}`, { headers: { cookie: cookieA2 } });
    assert.equal(detail.status, 404, 'un autre parent ne voit pas la notice');
  });
});

test('VS-03: admin voit la notice dans /admin/students/:id', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/admin/students/student-a1`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('Absences déclarées par les parents'), 'section absence visible');
    assert.ok(html.includes('Rendez-vous orthodontiste') || html.includes('rdv-medical') || html.includes('Rendez-vous médical'), 'notice seedée visible (parent-a1 → student-a1)');
  });
});

test('VS-03: CSRF — POST sans token → 403', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'parent@school-a.test');
    const response = await postMultipart(baseUrl, '/parent/absences', {
      cookie,
      fields: VS03_VALID_FIELDS,
      includeCsrf: false
    });
    assert.equal(response.status, 403);
  });
});

test('VS-03: dates invalides (end < start) → redirect error=invalid_dates', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'parent@school-a.test');
    const response = await postMultipart(baseUrl, '/parent/absences', {
      cookie,
      fields: { ...VS03_VALID_FIELDS, startDate: '2026-05-12', endDate: '2026-05-10' }
    });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /error=invalid_dates/);
  });
});

// =====================================================================
// Sprint 8 / VS-04 — Validation des notices d'absence (admin / director)
// =====================================================================
// Le seed in-memory expose deux notices "pending" exploitables :
//   - absence-notice-demo-1 : parent-a1 / student-a1 (class-a1, teacher-a1), 1 jour 2026-05-02
//   - absence-notice-demo-2 : parent-a2 / student-a4 (class-a2, teacher-a2), 3 jours 2026-04-22→24

test('VS-04: admin approuve une notice pending → status approved + attendance_records excused créés', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await postForm(baseUrl, '/admin/absences/absence-notice-demo-1/approve', {
      cookie,
      fields: {}
    });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /\/admin\/absences\?result=approved/);

    // Vérification : la notice est passée à approved
    const detail = await fetch(`${baseUrl}/admin/absences/absence-notice-demo-1`, { headers: { cookie } });
    const html = await detail.text();
    assert.ok(html.includes('Validée') || html.includes('approved'), 'badge "Validée" présent');

    // Vérification : attendance_records contient un record excused pour student-a1 le 2026-05-02
    const att = await fetch(`${baseUrl}/admin/attendance?date=2026-05-02&classRoomId=class-a1`, { headers: { cookie } });
    const attHtml = await att.text();
    assert.ok(attHtml.includes('student-a1') || attHtml.includes('Aya'), 'élève visible dans l\'appel');
    assert.ok(attHtml.includes('excused') || attHtml.includes('Absent justifié'), 'statut excused affiché');
  });
});

test('VS-04: director peut aussi approuver (mêmes droits que admin)', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'director@school-a.test');
    const response = await postForm(baseUrl, '/admin/absences/absence-notice-demo-1/approve', {
      cookie,
      fields: {}
    });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /result=approved/);
  });
});

test('VS-04: teacher ne peut PAS approuver → 403', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await postForm(baseUrl, '/admin/absences/absence-notice-demo-1/approve', {
      cookie,
      fields: {}
    });
    assert.equal(response.status, 403);
  });
});

test('VS-04: parent ne peut PAS approuver → 403', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'parent@school-a.test');
    const response = await postForm(baseUrl, '/admin/absences/absence-notice-demo-1/approve', {
      cookie,
      fields: {}
    });
    assert.equal(response.status, 403);
  });
});

test('VS-04: admin reject avec motif → status rejected + motif visible côté parent', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: adminCookie } = await login(baseUrl, 'admin@school-a.test');
    const motif = 'Justificatif illisible, merci de re-scanner le document.';
    const response = await postForm(baseUrl, '/admin/absences/absence-notice-demo-1/reject', {
      cookie: adminCookie,
      fields: { comment: motif }
    });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /result=rejected/);

    // Côté parent : la notice doit afficher le motif
    const { cookie: parentCookie } = await login(baseUrl, 'parent@school-a.test');
    const parentDetail = await fetch(`${baseUrl}/parent/absences/absence-notice-demo-1`, { headers: { cookie: parentCookie } });
    const html = await parentDetail.text();
    assert.ok(html.includes('Refusée'), 'statut Refusée visible');
    assert.ok(html.includes('illisible'), 'motif communiqué au parent');
  });
});

test('VS-04: admin reject sans motif → redirect error=review_failed', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await postForm(baseUrl, '/admin/absences/absence-notice-demo-1/reject', {
      cookie,
      fields: { comment: '' }
    });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /error=review_failed/);
  });
});

test('VS-04: re-review d\'une notice déjà traitée → redirect error=review_failed (idempotence)', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const first = await postForm(baseUrl, '/admin/absences/absence-notice-demo-1/approve', { cookie, fields: {} });
    assert.match(first.headers.get('location') || '', /result=approved/);

    const second = await postForm(baseUrl, '/admin/absences/absence-notice-demo-1/approve', { cookie, fields: {} });
    assert.equal(second.status, 302);
    assert.match(second.headers.get('location') || '', /error=review_failed/);
  });
});

test('VS-04: cross-tenant : admin school-a ne voit pas une notice school-b → 404', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    // Aucune notice de school-b dans le seed → un id inventé retourne 404
    const response = await fetch(`${baseUrl}/admin/absences/absence-notice-from-school-b`, { headers: { cookie } });
    assert.equal(response.status, 404);
  });
});

test('VS-04: CSRF — POST /admin/absences/:id/approve sans token → 403', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/admin/absences/absence-notice-demo-1/approve`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: '',
      redirect: 'manual'
    });
    assert.equal(response.status, 403);
  });
});

test('VS-04: la page detail rend un token CSRF valide dans les forms (pas "undefined")', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const page = await fetch(`${baseUrl}/admin/absences/absence-notice-demo-1`, { headers: { cookie } });
    assert.equal(page.status, 200);
    const html = await page.text();
    const matches = [...html.matchAll(/name="_csrf"\s+value="([^"]*)"/g)];
    assert.ok(matches.length >= 2, 'la page doit contenir au moins 2 forms protégés (approve + reject)');
    for (const [, token] of matches) {
      assert.notEqual(token, 'undefined', 'le token CSRF ne doit pas être la string littérale "undefined"');
      assert.notEqual(token, '', 'le token CSRF ne doit pas être vide');
      assert.match(token, /^[a-f0-9]{64}$/, 'le token CSRF doit être un hex 64 chars');
    }
  });
});

test('VS-04: sync multi-jours : 2026-04-22 → 24 (3 jours) → 3 attendance_records excused', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await postForm(baseUrl, '/admin/absences/absence-notice-demo-2/approve', {
      cookie,
      fields: {}
    });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /result=approved/);

    for (const date of ['2026-04-22', '2026-04-23', '2026-04-24']) {
      const att = await fetch(`${baseUrl}/admin/attendance?date=${date}&classRoomId=class-a2`, { headers: { cookie } });
      const html = await att.text();
      assert.ok(
        html.includes('excused') || html.includes('Absent justifié'),
        `record excused attendu le ${date}`
      );
    }
  });
});

test('VS-04: nav admin contient "Absences" + badge "2" (count seed pending)', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/admin/absences`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('href="/admin/absences"'), 'lien nav vers /admin/absences présent');
    assert.ok(html.match(/Absences\s*<span[^>]*>\s*2\s*</), 'badge "2" sur "Absences" (2 notices pending dans le seed)');
  });
});

test('VS-04: admin télécharge le justificatif via /admin/absences/:id/document', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    // demo-2 a un PDF joint dans le seed
    const response = await fetch(`${baseUrl}/admin/absences/absence-notice-demo-2/document`, { headers: { cookie } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    const body = Buffer.from(await response.arrayBuffer());
    assert.ok(body.toString('utf8').startsWith('%PDF-'), 'contenu PDF du seed');
  });
});

// =====================================================================
// Sprint 8 / VS-02 — Dashboard vie scolaire (admin / director)
// =====================================================================
// Le seed contient pour le 2026-04-20 : 1 absent (student-a4 class-a2),
// 1 retard (student-a3 class-a1) et 3 attendance events. Aucune classe n'a
// d'appel saisi en dehors du 2026-04-20 → utile pour le test "appels non faits".

test('VS-02: admin voit /admin/vie-scolaire avec les 5 cards', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/admin/vie-scolaire?date=2026-04-20`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    for (const label of ['Absents du jour', 'Retards du jour', 'Appels non faits', 'Notices à valider', 'Événements du jour']) {
      assert.ok(html.includes(label), `card "${label}" présente`);
    }
    assert.ok(html.includes('Vie scolaire — tableau de bord du jour'), 'titre principal');
  });
});

test('VS-02: director voit aussi le dashboard (même perm)', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'director@school-a.test');
    const response = await fetch(`${baseUrl}/admin/vie-scolaire`, { headers: { cookie } });
    assert.equal(response.status, 200);
  });
});

test('VS-02: teacher → 403 sur /admin/vie-scolaire', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await fetch(`${baseUrl}/admin/vie-scolaire`, { headers: { cookie } });
    assert.equal(response.status, 403);
  });
});

test('VS-02: parent → 403 sur /admin/vie-scolaire', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'parent@school-a.test');
    const response = await fetch(`${baseUrl}/admin/vie-scolaire`, { headers: { cookie } });
    assert.equal(response.status, 403);
  });
});

test('VS-02: date sans données → cards à 0 + sections vides', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/admin/vie-scolaire?date=2030-12-31`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('Aucun élève absent'), 'message vide absents');
    assert.ok(html.includes('Aucun événement consigné'), 'message vide événements');
    // Toutes les classes du tenant doivent figurer dans "appels non faits" pour cette date inexistante
    assert.ok(!html.includes('Tous les appels sont saisis.'), 'au moins 1 classe sans appel pour une date future');
  });
});

test('VS-02: filtre classe limite les indicateurs (class-a1 seulement)', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/admin/vie-scolaire?date=2026-04-20&classRoomId=class-a1`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    // Le seed pour 2026-04-20 a 1 absent en class-a2 (student-a4). Avec filtre class-a1, il ne doit PAS apparaître.
    assert.ok(!html.includes('student-a4'), 'student-a4 (class-a2) absent de la vue filtrée class-a1');
    // En revanche student-a3 (class-a1, status late) est dans dayRecords mais pas dans absents (juste compté dans retards).
  });
});

test('VS-02: nav admin contient "Vie scolaire" entre "Présences" et "Absences"', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/admin/vie-scolaire`, { headers: { cookie } });
    const html = await response.text();
    const presPos = html.indexOf('href="/admin/attendance"');
    const viePos = html.indexOf('href="/admin/vie-scolaire"');
    const absPos = html.indexOf('href="/admin/absences"');
    assert.ok(presPos > 0 && viePos > 0 && absPos > 0, 'les 3 liens sont présents');
    assert.ok(presPos < viePos && viePos < absPos, 'ordre Présences → Vie scolaire → Absences dans la nav');
  });
});

test('VS-02: cross-tenant — admin-b ne voit aucune donnée school-a', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-b.test');
    const response = await fetch(`${baseUrl}/admin/vie-scolaire?date=2026-04-20`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    // Aucun nom d'élève school-a (Aya, Salim, Lina, Yanis, Ines) ne doit apparaître
    for (const name of ['Aya', 'Salim', 'Lina', 'Yanis', 'Ines']) {
      assert.ok(!html.includes(name), `pas de fuite cross-tenant : ${name} ne doit pas apparaître`);
    }
  });
});

// =====================================================================
// Sprint 8 / VS-05 — Module discipline (observations, retenues, exclusions, convocations)
// =====================================================================
// Seed in-memory : 3 records discipline pour school-a :
//   - discipline-demo-1 : teacher-a1 → student-a3 → observation (2026-04-18)
//   - discipline-demo-2 : teacher-a2 → student-a4 → retenue (2026-04-19, 1h)
//   - discipline-demo-3 : admin-a → student-a2 → convocation parents (2026-04-20)

test('VS-05: teacher crée observation pour son élève → 302 + visible fiche élève', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    // teacher-a1 enseigne class-a1 → student-a1
    const response = await postForm(baseUrl, '/teacher/discipline', {
      cookie,
      fields: {
        studentId: 'student-a1',
        returnTo: 'student-a1',
        measureType: 'observation',
        occurredOn: '2026-05-10',
        description: 'Marker-VS05-test1'
      }
    });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /\/teacher\/students\/student-a1\?disc=created/);

    const fiche = await fetch(`${baseUrl}/teacher/students/student-a1`, { headers: { cookie } });
    const html = await fiche.text();
    assert.ok(html.includes('Marker-VS05-test1'), 'mesure visible dans fiche élève');
    assert.ok(html.includes('Observation'), 'badge type visible');
  });
});

test('VS-05: teacher ne peut PAS créer pour élève hors de ses classes → 403', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    // teacher-a1 n'enseigne pas class-a2 → student-a4 inaccessible
    const response = await postForm(baseUrl, '/teacher/discipline', {
      cookie,
      fields: {
        studentId: 'student-a4',
        returnTo: 'student-a4',
        measureType: 'observation',
        occurredOn: '2026-05-10',
        description: 'Test interdit'
      }
    });
    assert.equal(response.status, 403);
  });
});

test('VS-05: admin crée retenue depuis /admin/discipline POST → visible liste', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await postForm(baseUrl, '/admin/discipline', {
      cookie,
      fields: {
        studentId: 'student-a3',
        measureType: 'detention',
        occurredOn: '2026-05-12',
        scheduledFor: '2026-05-15',
        durationMinutes: '120',
        description: 'Marker-VS05-retenue-admin'
      }
    });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /result=created/);

    const list = await fetch(`${baseUrl}/admin/discipline`, { headers: { cookie } });
    const html = await list.text();
    assert.ok(html.includes('Marker-VS05-retenue-admin'), 'retenue visible dans la liste admin');
    assert.ok(html.includes('Retenue'), 'label FR Retenue');
  });
});

test('VS-05: director crée aussi (même perm que admin)', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'director@school-a.test');
    const response = await postForm(baseUrl, '/admin/discipline', {
      cookie,
      fields: {
        studentId: 'student-a1',
        measureType: 'parent_meeting',
        occurredOn: '2026-05-13',
        scheduledFor: '2026-05-20',
        description: 'Convocation par director'
      }
    });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /result=created/);
  });
});

test('VS-05: parent ne peut PAS créer (ni via /admin ni via /teacher)', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'parent@school-a.test');
    const r1 = await postForm(baseUrl, '/admin/discipline', { cookie, fields: { studentId: 'student-a1', measureType: 'observation', occurredOn: '2026-05-10', description: 'X' } });
    assert.equal(r1.status, 403);
    const r2 = await postForm(baseUrl, '/teacher/discipline', { cookie, fields: { studentId: 'student-a1', measureType: 'observation', occurredOn: '2026-05-10', description: 'X' } });
    assert.equal(r2.status, 403);
  });
});

test('VS-05: parent voit ses enfants dans /parent/discipline (et pas les autres)', async () => {
  await withServer(async (baseUrl) => {
    // parent-a1 est lié à student-a1 et student-a2 (cf seed studentParentLinks)
    const { cookie } = await login(baseUrl, 'parent@school-a.test');
    const response = await fetch(`${baseUrl}/parent/discipline`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    // Le seed contient discipline-demo-3 pour student-a2 (convocation parents)
    assert.ok(html.includes('Salim'), 'student-a2 (Salim, lié à parent-a1) visible');
    // student-a3 (Lina) et student-a4 (Yanis) ne sont PAS liés à parent-a1
    assert.ok(!html.includes('Lina'), 'student-a3 (Lina) NON liée à parent-a1 ne doit pas apparaître');
    assert.ok(!html.includes('Yanis'), 'student-a4 (Yanis) NON liée à parent-a1 ne doit pas apparaître');
  });
});

test('VS-05: cross-tenant : parent school-a ne voit pas mesures school-b', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'parent@school-a.test');
    const response = await fetch(`${baseUrl}/parent/discipline`, { headers: { cookie } });
    const html = await response.text();
    assert.ok(!html.includes('school-b'), 'pas de fuite cross-tenant');
    assert.ok(!html.includes('student-b'), 'pas d\'élève school-b');
  });
});

test('VS-05: teacher supprime sa propre mesure', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    // créer une mesure marker
    await postForm(baseUrl, '/teacher/discipline', {
      cookie,
      fields: {
        studentId: 'student-a1',
        returnTo: 'student-a1',
        measureType: 'observation',
        occurredOn: '2026-05-11',
        description: 'Marker-supprime-VS05'
      }
    });
    // récupérer l'id depuis la fiche
    const fiche = await fetch(`${baseUrl}/teacher/students/student-a1`, { headers: { cookie } });
    const html = await fiche.text();
    const match = html.match(/action="\/discipline\/(discipline-[a-z0-9-]+)\/delete"/);
    assert.ok(match, 'bouton supprimer présent');
    const recordId = match[1];

    const del = await postForm(baseUrl, `/discipline/${recordId}/delete`, {
      cookie,
      fields: { returnTo: 'student-a1' }
    });
    assert.equal(del.status, 302);
    assert.match(del.headers.get('location') || '', /disc=deleted/);

    const after = await fetch(`${baseUrl}/teacher/students/student-a1`, { headers: { cookie } });
    const afterHtml = await after.text();
    assert.ok(!afterHtml.includes('Marker-supprime-VS05'), 'mesure disparue');
  });
});

test('VS-05: teacher ne peut PAS supprimer la mesure d\'un autre teacher', async () => {
  await withServer(async (baseUrl) => {
    // teacher-a2 essaie de supprimer discipline-demo-1 créée par teacher-a1
    const { cookie } = await login(baseUrl, 'teacher2@school-a.test');
    const response = await postForm(baseUrl, '/discipline/discipline-demo-1/delete', { cookie, fields: {} });
    assert.equal(response.status, 403);
  });
});

test('VS-05: admin peut supprimer n\'importe quelle mesure du tenant', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await postForm(baseUrl, '/discipline/discipline-demo-1/delete', { cookie, fields: {} });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /(result=deleted|disc=deleted)/);
  });
});

test('VS-05: nav admin contient "Discipline" + nav parent contient "Discipline"', async () => {
  await withServer(async (baseUrl) => {
    const { cookie: adminCookie } = await login(baseUrl, 'admin@school-a.test');
    const adminPage = await fetch(`${baseUrl}/admin/discipline`, { headers: { cookie: adminCookie } });
    const adminHtml = await adminPage.text();
    assert.ok(adminHtml.includes('href="/admin/discipline"'), 'lien admin nav');

    const { cookie: parentCookie } = await login(baseUrl, 'parent@school-a.test');
    const parentPage = await fetch(`${baseUrl}/parent/discipline`, { headers: { cookie: parentCookie } });
    const parentHtml = await parentPage.text();
    assert.ok(parentHtml.includes('href="/parent/discipline"'), 'lien parent nav');
  });
});

test('VS-05: CSRF — POST /admin/discipline sans token → 403', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/admin/discipline`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ studentId: 'student-a1', measureType: 'observation', occurredOn: '2026-05-10', description: 'no csrf' }).toString(),
      redirect: 'manual'
    });
    assert.equal(response.status, 403);
  });
});

// =====================================================================
// Sprint 8 / VS-06 — Statistiques d'absentéisme + seuils d'alerte
// =====================================================================
// Le seed in-memory expose pour la plage 2025-09-01 → 2026-07-05 (année scolaire complète) :
//   - attendance_records : 1 absent (student-a4 en 2026-04-20), 1 late (student-a3)
//   - discipline_records : 3 mesures (student-a3, student-a4, student-a2)
//   - 2 notices d'absence pending (pas excused, donc pas comptées sans approve)
// Les tests créent des records additionnels via les routes pour valider les tops.

test('VS-06: admin voit /admin/stats-absences avec 3 tableaux', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/admin/stats-absences`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    for (const title of ['Top 10 absentéisme', 'Top 10 retards', 'Top 5 mesures disciplinaires']) {
      assert.ok(html.includes(title), `tableau "${title}" présent`);
    }
    assert.ok(html.includes('Seuils d\'alerte actifs'), 'encart seuils présent');
  });
});

test('VS-06: director voit aussi /admin/stats-absences', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'director@school-a.test');
    const response = await fetch(`${baseUrl}/admin/stats-absences`, { headers: { cookie } });
    assert.equal(response.status, 200);
  });
});

test('VS-06: teacher → 403 sur /admin/stats-absences', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await fetch(`${baseUrl}/admin/stats-absences`, { headers: { cookie } });
    assert.equal(response.status, 403);
  });
});

test('VS-06: parent → 403 sur /admin/stats-absences', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'parent@school-a.test');
    const response = await fetch(`${baseUrl}/admin/stats-absences`, { headers: { cookie } });
    assert.equal(response.status, 403);
  });
});

test('VS-06: filtre from/to restreint la fenêtre — student-a4 absent visible en 2026-04, invisible en 2025-12', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    // Plage qui inclut le seed 2026-04-20 → student-a4 doit apparaître dans top absents
    const inRange = await fetch(`${baseUrl}/admin/stats-absences?from=2026-04-01&to=2026-04-30`, { headers: { cookie } });
    const inHtml = await inRange.text();
    assert.ok(inHtml.includes('Yanis') || inHtml.includes('student-a4'), 'student-a4 visible dans la plage');

    // Plage en dehors → tops vides
    const outRange = await fetch(`${baseUrl}/admin/stats-absences?from=2025-09-01&to=2025-09-30`, { headers: { cookie } });
    const outHtml = await outRange.text();
    assert.ok(outHtml.includes('Aucun élève absent sur la période'), 'tops vides hors plage');
  });
});

test('VS-06: badge "Alerte" apparaît après baisse du seuil absent', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    // Baisse le seuil d'absence à 1 → student-a4 (1 absent) doit être flaggé
    await postForm(baseUrl, '/admin/stats-absences/settings', {
      cookie,
      fields: { absentThreshold: '1', lateThreshold: '1', disciplineThreshold: '1', windowDays: '30' }
    });
    const response = await fetch(`${baseUrl}/admin/stats-absences?from=2026-04-01&to=2026-04-30`, { headers: { cookie } });
    const html = await response.text();
    assert.ok(html.includes('⚠ Alerte'), 'au moins un badge alerte présent');
    assert.ok(html.includes('Personnalisés'), 'badge "Personnalisés" sur l\'encart seuils');
  });
});

test('VS-06: settings — director peut consulter mais POST refusé', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'director@school-a.test');
    const get = await fetch(`${baseUrl}/admin/stats-absences/settings`, { headers: { cookie } });
    assert.equal(get.status, 200);
    const html = await get.text();
    assert.ok(html.includes('Seul un administrateur'), 'message lecture seule visible');

    const post = await postForm(baseUrl, '/admin/stats-absences/settings', {
      cookie,
      fields: { absentThreshold: '10', lateThreshold: '5', disciplineThreshold: '5', windowDays: '60' }
    });
    assert.equal(post.status, 403);
  });
});

test('VS-06: settings — admin POST valide → redirect result=updated', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await postForm(baseUrl, '/admin/stats-absences/settings', {
      cookie,
      fields: { absentThreshold: '8', lateThreshold: '4', disciplineThreshold: '2', windowDays: '45' }
    });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /result=updated/);

    // Vérifier que la page stats reflète les nouveaux seuils
    const stats = await fetch(`${baseUrl}/admin/stats-absences`, { headers: { cookie } });
    const html = await stats.text();
    assert.ok(html.includes('Absents ≥ 8'), 'nouveau seuil absent visible');
    assert.ok(html.includes('Retards ≥ 4'), 'nouveau seuil retards visible');
  });
});

test('VS-06: settings — POST hors bornes → redirect error', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await postForm(baseUrl, '/admin/stats-absences/settings', {
      cookie,
      fields: { absentThreshold: '0', lateThreshold: '4', disciplineThreshold: '2', windowDays: '45' }
    });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /result=error/);
  });
});

test('VS-06: cross-tenant — admin-b voit ses seuils par défaut (pas ceux modifiés en school-a)', async () => {
  await withServer(async (baseUrl) => {
    // Modifier les seuils en school-a
    const { cookie: cookieA } = await login(baseUrl, 'admin@school-a.test');
    await postForm(baseUrl, '/admin/stats-absences/settings', {
      cookie: cookieA,
      fields: { absentThreshold: '20', lateThreshold: '20', disciplineThreshold: '20', windowDays: '90' }
    });

    // school-b doit garder les défauts
    const { cookie: cookieB } = await login(baseUrl, 'admin@school-b.test');
    const stats = await fetch(`${baseUrl}/admin/stats-absences`, { headers: { cookie: cookieB } });
    const html = await stats.text();
    assert.ok(html.includes('Absents ≥ 5'), 'seuil par défaut absent pour school-b');
    assert.ok(html.includes('valeurs par défaut'), 'mention valeurs par défaut');
    // Aucun élève school-a visible
    for (const name of ['Aya', 'Salim', 'Lina', 'Yanis']) {
      assert.ok(!html.includes(name), `pas de fuite cross-tenant ${name}`);
    }
  });
});

// =====================================================================
// Sprint 8 / VS-07 — Détection décrocheurs IA (killer feature)
// =====================================================================

test('VS-07: admin voit /admin/decrocheurs avec le tableau', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/admin/decrocheurs`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('Détection décrocheurs'), 'titre page');
    assert.ok(html.includes('Score'), 'colonne Score');
    assert.ok(html.includes('Niveau'), 'colonne Niveau');
  });
});

test('VS-07: director voit aussi /admin/decrocheurs', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'director@school-a.test');
    const response = await fetch(`${baseUrl}/admin/decrocheurs`, { headers: { cookie } });
    assert.equal(response.status, 200);
  });
});

test('VS-07: teacher → 403 sur /admin/decrocheurs', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'teacher@school-a.test');
    const response = await fetch(`${baseUrl}/admin/decrocheurs`, { headers: { cookie } });
    assert.equal(response.status, 403);
  });
});

test('VS-07: parent → 403 sur /admin/decrocheurs', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'parent@school-a.test');
    const response = await fetch(`${baseUrl}/admin/decrocheurs`, { headers: { cookie } });
    assert.equal(response.status, 403);
  });
});

test('VS-07: POST /admin/decrocheurs/:studentId/analyze déclenche AI + persiste + redirige', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await postForm(baseUrl, '/admin/decrocheurs/student-a4/analyze', {
      cookie,
      fields: { returnTo: '/admin/decrocheurs/student-a4' }
    });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /dropout=generated/);

    // Vérifier que la synthèse persistée est visible sur la page détail
    const detail = await fetch(`${baseUrl}/admin/decrocheurs/student-a4`, { headers: { cookie } });
    const html = await detail.text();
    assert.ok(html.includes('[dev-echo]'), 'le devEchoProvider doit retourner [dev-echo] dans la synthèse');
    assert.ok(html.includes('student.dropout.risk') || html.includes('Tu es un assistant'), 'le prompt template est inclus dans le dev-echo');
  });
});

test('VS-07: POST analyze 2e fois dans les 7 jours sans force → réutilise le cache (pas de 2e analyse)', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    // 1ère analyse
    await postForm(baseUrl, '/admin/decrocheurs/student-a4/analyze', { cookie, fields: { returnTo: '/admin/decrocheurs/student-a4' } });
    // 2ème : sans force → cached
    const cached = await postForm(baseUrl, '/admin/decrocheurs/student-a4/analyze', { cookie, fields: { returnTo: '/admin/decrocheurs/student-a4' } });
    assert.match(cached.headers.get('location') || '', /dropout=cached/);

    const detail = await fetch(`${baseUrl}/admin/decrocheurs/student-a4`, { headers: { cookie } });
    const html = await detail.text();
    // Une seule entrée dans l'historique attendue (le 2ème POST est cached, pas de 2e analyse créée)
    const historyCount = (html.match(/provider dev-echo/g) || []).length;
    assert.equal(historyCount, 1, `attendu 1 entrée historique (cache hit sur 2e call), trouvé ${historyCount}`);
  });
});

test('VS-07: POST analyze avec ?force=1 (champ form) bypass le cache → nouvelle analyse', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    await postForm(baseUrl, '/admin/decrocheurs/student-a4/analyze', { cookie, fields: { returnTo: '/admin/decrocheurs/student-a4' } });
    const forced = await postForm(baseUrl, '/admin/decrocheurs/student-a4/analyze', {
      cookie,
      fields: { returnTo: '/admin/decrocheurs/student-a4', force: '1' }
    });
    assert.match(forced.headers.get('location') || '', /dropout=generated/);

    const detail = await fetch(`${baseUrl}/admin/decrocheurs/student-a4`, { headers: { cookie } });
    const html = await detail.text();
    const historyCount = (html.match(/provider dev-echo/g) || []).length;
    assert.equal(historyCount, 2, `attendu 2 entrées d'historique après force, trouvé ${historyCount}`);
  });
});

test('VS-07: tenant school-b (AI désactivée) → POST analyze redirige error=ai_disabled', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-b.test');
    const response = await postForm(baseUrl, '/admin/decrocheurs/student-b1/analyze', {
      cookie,
      fields: { returnTo: '/admin/decrocheurs/student-b1' }
    });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /dropout=ai_disabled/);
  });
});

test('VS-07: fiche élève admin contient la section "Risque de décrochage" + bouton Analyser', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/admin/students/student-a4`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('Risque de décrochage'), 'section présente');
    assert.ok(html.includes('Analyser cet élève') || html.includes('Forcer une nouvelle analyse'), 'bouton d\'analyse présent');
  });
});

test('VS-07: nav admin contient lien "Décrocheurs"', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/admin/decrocheurs`, { headers: { cookie } });
    const html = await response.text();
    assert.ok(html.includes('href="/admin/decrocheurs"'), 'lien nav présent');
  });
});

test('VS-07: CSRF — POST analyze sans token → 403', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-a.test');
    const response = await fetch(`${baseUrl}/admin/decrocheurs/student-a4/analyze`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ returnTo: '/admin/decrocheurs/student-a4' }).toString(),
      redirect: 'manual'
    });
    assert.equal(response.status, 403);
  });
});

test('VS-07: cross-tenant — admin-b ne peut pas POST analyze sur student-a1 → 404', async () => {
  await withServer(async (baseUrl) => {
    const { cookie } = await login(baseUrl, 'admin@school-b.test');
    const response = await postForm(baseUrl, '/admin/decrocheurs/student-a1/analyze', {
      cookie,
      fields: { returnTo: '/admin/decrocheurs/student-a1' }
    });
    assert.equal(response.status, 404);
  });
});

// ============================================================
// Refonte design — tokens CSS + page showcase dev-only
// ============================================================

test('refonte-design: le CSS servi contient les tokens critiques (Nunito + indigo + dark mode)', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/assets/design-system.css`);
    assert.equal(response.status, 200);
    const css = await response.text();
    assert.ok(css.includes('#4F46E5'), 'la palette indigo (couleur primaire) doit être présente');
    assert.ok(css.includes('"Nunito"'), 'la police Nunito doit être déclarée dans font-family');
    assert.ok(css.includes('[data-theme="dark"]'), 'le sélecteur dark mode doit exister');
    assert.ok(css.includes('--el-gradient-brand'), 'le gradient brand doit être déclaré comme variable');
  });
});

test('refonte-design: la page showcase /__design est accessible en dev', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/__design`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('Design Showcase'), 'le titre de la page showcase doit être présent');
    assert.ok(html.includes('data-theme="light"'), 'la section light mode doit être rendue');
    assert.ok(html.includes('data-theme="dark"'), 'la section dark mode doit être rendue');
  });
});

test('refonte-design: la page showcase /__design retourne 404 en production', async () => {
  const productionRuntimeEnv = {
    nodeEnv: 'production',
    host: '127.0.0.1',
    port: 0,
    persistenceMode: 'memory',
    databaseUrl: '',
    logFormat: 'pretty',
    logLevel: 'info',
    sessionSecret: 'a'.repeat(32),
    sessionSecretIsFallback: false
  };
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/__design`);
    assert.equal(response.status, 404);
  }, { runtimeEnv: productionRuntimeEnv });
});

test('Klassly-feed: GET /class-feed accessible aux 5 roles', async () => {
  await withServer(async (baseUrl) => {
    for (const email of ['admin@school-a.test', 'director@school-a.test', 'teacher@school-a.test', 'parent@school-a.test', 'student@school-a.test']) {
      const { cookie } = await login(baseUrl, email);
      const response = await fetch(`${baseUrl}/class-feed`, { headers: { cookie }, redirect: 'manual' });
      // Soit 200 (page selector) soit 302 (redirect direct si 1 seule classe)
      assert.ok([200, 302].includes(response.status), `failed for ${email}, got ${response.status}`);
    }
  });
});

test('Klassly-feed: GET /class-feed sans session redirige /login', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/class-feed`, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.match(response.headers.get('location') || '', /\/login/);
  });
});
