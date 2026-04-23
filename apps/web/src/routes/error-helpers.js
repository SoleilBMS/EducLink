const { buildForbiddenError, buildNotFoundError, toApiErrorPayload } = require('../modules/error-utils');

function ensureAuthorized(authResult) {
  if (authResult.ok) {
    return null;
  }

  return {
    status: authResult.status,
    code: authResult.error.code,
    message: authResult.error.message
  };
}

function handleRouteError(sendApiError, response, error, fallback = {}) {
  sendApiError(response, toApiErrorPayload(error, fallback));
}

module.exports = {
  buildForbiddenError,
  buildNotFoundError,
  ensureAuthorized,
  handleRouteError
};
