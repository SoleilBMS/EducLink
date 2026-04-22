const { ROLES } = require('../../../../packages/auth/src/roles/roles');
const { authorizeApiRequest } = require('../../../../packages/auth/src/guards/api-guard');

function createAttendanceRoutes({ attendanceService, sendApiError, sendApiSuccess, parseJsonBody, buildTenantScope }) {
  return async function handleAttendanceRoutes({ request, response, url, session }) {
    if (url.pathname === '/api/v1/attendance' && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
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
        sendApiError(response, error.status ?? 422, error.code ?? 'VALIDATION_ERROR', error.message);
      }
      return true;
    }

    if (url.pathname === '/api/v1/attendance' && request.method === 'POST') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.TEACHER] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return true;
      }

      try {
        const payload = await parseJsonBody(request);
        const saved = attendanceService.upsertForTeacher(session.tenantId, session.userId, payload);
        sendApiSuccess(response, saved, 201);
      } catch (error) {
        const message = error.message === 'Teacher is not authorized for this class room' ? 'FORBIDDEN_CLASSROOM' : error.message;
        const status = error.message === 'Teacher is not authorized for this class room' ? 403 : error.status ?? 422;
        const code = error.message === 'Teacher is not authorized for this class room' ? 'FORBIDDEN' : error.code ?? 'VALIDATION_ERROR';
        sendApiError(response, status, code, message);
      }
      return true;
    }

    return false;
  };
}

module.exports = { createAttendanceRoutes };
