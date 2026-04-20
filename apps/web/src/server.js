const http = require('node:http');

const { requireAuth } = require('../../../packages/auth/src/guards/require-auth');
const { SessionStore } = require('../../../packages/auth/src/session/session-store');

const users = [
  {
    id: 'u-admin-a',
    email: 'admin@school-a.test',
    password: 'password123',
    role: 'school_admin',
    tenantId: 'school-a'
  }
];

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
