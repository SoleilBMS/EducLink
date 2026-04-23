const crypto = require('node:crypto');

const { buildValidationError, toApiErrorPayload } = require('../modules/error-utils');

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

  const cookies = Object.create(null);
  return cookieHeader
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((accumulator, entry) => {
      const [name, ...rawValue] = entry.split('=');
      if (!name || rawValue.length === 0) {
        return accumulator;
      }
      if (!/^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/.test(name)) {
        return accumulator;
      }
      if (name === '__proto__' || name === 'constructor' || name === 'prototype') {
        return accumulator;
      }

      try {
        accumulator[name] = decodeURIComponent(rawValue.join('='));
      } catch {
        accumulator[name] = rawValue.join('=');
      }
      return accumulator;
    }, cookies);
}

async function parseJsonBody(request, validationErrorBuilder = buildValidationError) {
  const rawBody = await readBody(request);
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw validationErrorBuilder('Request body must be valid JSON', {
      source: 'body',
      issue: 'invalid_json'
    });
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function sendApiSuccess(response, data, statusCode = 200, meta = {}) {
  sendJson(response, statusCode, {
    success: true,
    data,
    meta: { request_id: crypto.randomUUID(), ...meta }
  });
}

function sendApiError(response, statusOrError, code, message, details) {
  const errorPayload =
    typeof statusOrError === 'number'
      ? toApiErrorPayload({ status: statusOrError, code, message, details })
      : toApiErrorPayload(statusOrError);

  sendJson(response, errorPayload.status, {
    success: false,
    error: {
      code: errorPayload.code,
      message: errorPayload.message,
      ...(errorPayload.details !== undefined ? { details: errorPayload.details } : {})
    },
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
