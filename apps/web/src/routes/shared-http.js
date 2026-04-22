const crypto = require('node:crypto');

function readBody(request) {
  return new Promise((resolve) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => resolve(body));
  });
}

function parseExtendedForm(formBody) {
  const searchParams = new URLSearchParams(formBody);
  return {
    get(name) {
      return searchParams.get(name) ?? '';
    },
    getAll(name) {
      return searchParams.getAll(name);
    }
  };
}

function parseForm(formBody) {
  const searchParams = new URLSearchParams(formBody);
  return {
    email: searchParams.get('email') ?? '',
    password: searchParams.get('password') ?? ''
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

async function parseJsonBody(request, buildValidationError) {
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

function sendApiError(response, statusCode, code, message) {
  sendJson(response, statusCode, {
    error: { code, message },
    meta: { request_id: crypto.randomUUID() }
  });
}

module.exports = {
  parseCookies,
  parseExtendedForm,
  parseForm,
  parseJsonBody,
  readBody,
  sendApiError,
  sendApiSuccess,
  sendJson
};
