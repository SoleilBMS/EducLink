const ERROR_CODES = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
});

function createAppError({ status, code, message, details }) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details !== undefined) {
    error.details = details;
  }
  return error;
}

function buildValidationError(message, details) {
  return createAppError({ status: 422, code: ERROR_CODES.VALIDATION_ERROR, message, details });
}

function buildForbiddenError(message = 'Forbidden', details) {
  return createAppError({ status: 403, code: ERROR_CODES.FORBIDDEN, message, details });
}

function buildNotFoundError(message = 'Resource not found', details) {
  return createAppError({ status: 404, code: ERROR_CODES.NOT_FOUND, message, details });
}

function buildInternalError(message = 'Internal server error', details) {
  return createAppError({ status: 500, code: ERROR_CODES.INTERNAL_ERROR, message, details });
}

function toApiErrorPayload(error, fallback = {}) {
  if (!error) {
    return {
      status: fallback.status ?? 500,
      code: fallback.code ?? ERROR_CODES.INTERNAL_ERROR,
      message: fallback.message ?? 'Internal server error',
      details: fallback.details
    };
  }

  return {
    status: error.status ?? fallback.status ?? 500,
    code: error.code ?? fallback.code ?? ERROR_CODES.INTERNAL_ERROR,
    message: error.message ?? fallback.message ?? 'Internal server error',
    details: error.details ?? fallback.details
  };
}

module.exports = {
  ERROR_CODES,
  createAppError,
  buildValidationError,
  buildForbiddenError,
  buildNotFoundError,
  buildInternalError,
  toApiErrorPayload
};
