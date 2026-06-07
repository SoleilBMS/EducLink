const { ROLES } = require('../../../../packages/auth/src/roles/roles');
const { authorizeApiRequest } = require('../../../../packages/auth/src/guards/api-guard');
const { buildForbiddenError, ensureAuthorized, handleRouteError } = require('./error-helpers');

function createAttendanceRoutes({
  attendanceService,
  teacherStore,
  parentStore,
  sendApiError,
  sendApiSuccess,
  parseJsonBody,
  buildTenantScope
}) {
  return async function handleAttendanceRoutes({ request, response, url, session }) {
    if (url.pathname === '/api/v1/attendance' && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, {
        allowedRoles: [ROLES.SCHOOL_ADMIN, ROLES.TEACHER, ROLES.PARENT, ROLES.STUDENT]
      });
      const authError = ensureAuthorized(auth);
      if (authError) {
        sendApiError(response, authError);
        return true;
      }

      try {
        const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
        const classRoomId = url.searchParams.get('classRoomId') || undefined;
        const date = url.searchParams.get('date') || undefined;

        // Teachers may only list attendance for class rooms they own.
        if (session.role === ROLES.TEACHER) {
          if (!classRoomId) {
            sendApiError(response, 400, 'CLASSROOM_REQUIRED', 'classRoomId est requis pour un enseignant');
            return true;
          }
          if (teacherStore) {
            const teacher = teacherStore.get(tenantId, session.userId, { includeArchived: false });
            if (!teacher || !teacher.classRoomIds.includes(classRoomId)) {
              sendApiError(response, 403, 'FORBIDDEN', 'Enseignant non autorisé pour cette classe');
              return true;
            }
          }
        }

        // Parents see attendance only for their linked children.
        if (session.role === ROLES.PARENT) {
          const childIds = parentStore
            ? new Set(
                parentStore.listLinksByParent(tenantId, session.userId).map((link) => link.studentId)
              )
            : new Set();
          const records = (await attendanceService.listAttendance(tenantId, { date, classRoomId })).filter(
            (record) => childIds.has(record.studentId)
          );
          sendApiSuccess(response, records);
          return true;
        }

        // Students see only their own attendance.
        if (session.role === ROLES.STUDENT) {
          const records = (await attendanceService.listAttendance(tenantId, { date, classRoomId })).filter(
            (record) => record.studentId === session.userId
          );
          sendApiSuccess(response, records);
          return true;
        }

        const records = await attendanceService.listAttendance(tenantId, { date, classRoomId });
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
        const saved = await attendanceService.upsertForTeacher(session.tenantId, session.userId, payload);
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
