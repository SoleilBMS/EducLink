const { ROLES } = require('../../../../packages/auth/src/roles/roles');
const { authorizeApiRequest } = require('../../../../packages/auth/src/guards/api-guard');
const { buildForbiddenError, ensureAuthorized, handleRouteError } = require('./error-helpers');

function createAttendanceRoutes({ attendanceService, sendApiError, sendApiSuccess, parseJsonBody, buildTenantScope }) {
  return async function handleAttendanceRoutes({ request, response, url, session }) {
    if (url.pathname === '/api/v1/attendance' && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
      const authError = ensureAuthorized(auth);
      if (authError) {
        sendApiError(response, authError);
        return true;
      }

      try {
        const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
        const records = attendanceService.listAttendance(tenantId, {
          date: url.searchParams.get('date') || undefined,
          classRoomId: url.searchParams.get('classRoomId') || undefined
        });
        sendApiSuccess(response, records);
      } catch (error) {
        handleRouteError(sendApiError, response, error, { status: 422, code: 'VALIDATION_ERROR', message: 'Validation failed' });
      }
      return true;
    }

    if (url.pathname === '/api/v1/attendance' && request.method === 'POST') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.TEACHER] });
      const authError = ensureAuthorized(auth);
      if (authError) {
        sendApiError(response, authError);
        return true;
      }

      try {
        const payload = await parseJsonBody(request);
        const saved = attendanceService.upsertForTeacher(session.tenantId, session.userId, payload);
        sendApiSuccess(response, saved, 201);
      } catch (error) {
        if (error.message === 'Teacher is not authorized for this class room') {
          sendApiError(response, buildForbiddenError('Teacher is not authorized for this class room'));
        } else {
          handleRouteError(sendApiError, response, error, { status: 422, code: 'VALIDATION_ERROR', message: 'Validation failed' });
        }
      }
      return true;
    }

    return false;
  };
}

module.exports = { createAttendanceRoutes };
