const { ROLES } = require('../../../../packages/auth/src/roles/roles');
const { authorizeApiRequest } = require('../../../../packages/auth/src/guards/api-guard');
const { buildNotFoundError, ensureAuthorized, handleRouteError } = require('./error-helpers');

function createStudentRoutes({ studentService, auditWriter, sendApiError, sendApiSuccess, parseJsonBody, buildTenantScope }) {
  return async function handleStudentRoutes({ request, response, url, session }) {
    if (url.pathname === '/api/v1/students' && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR] });
      const authError = ensureAuthorized(auth);
      if (authError) {
        sendApiError(response, authError);
        return true;
      }

      const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
      const classRoomId = url.searchParams.get('classRoomId') ?? undefined;
      sendApiSuccess(response, await studentService.listStudents(tenantId, { classRoomId }));
      return true;
    }

    if (url.pathname === '/api/v1/students' && request.method === 'POST') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
      const authError = ensureAuthorized(auth);
      if (authError) {
        sendApiError(response, authError);
        return true;
      }

      try {
        const payload = await parseJsonBody(request);
        const tenantId = buildTenantScope(session, payload);
        const student = await studentService.createStudent(tenantId, payload);
        auditWriter.writeEntityEvent(session, 'student.create', 'student', student.id);
        sendApiSuccess(response, student, 201);
      } catch (error) {
        handleRouteError(sendApiError, response, error, { status: 422, code: 'VALIDATION_ERROR', message: 'Validation failed' });
      }
      return true;
    }

    const studentByIdMatch = url.pathname.match(/^\/api\/v1\/students\/([^/]+)$/);
    if (studentByIdMatch) {
      const studentId = studentByIdMatch[1];
      if (request.method === 'GET') {
        const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR] });
        const authError = ensureAuthorized(auth);
        if (authError) {
          sendApiError(response, authError);
          return true;
        }

        const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
        const student = await studentService.getStudent(tenantId, studentId);
        if (!student) {
          sendApiError(response, buildNotFoundError('Student not found'));
          return true;
        }
        sendApiSuccess(response, student);
        return true;
      }

      if (request.method === 'PUT') {
        const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
        const authError = ensureAuthorized(auth);
        if (authError) {
          sendApiError(response, authError);
          return true;
        }

        try {
          const payload = await parseJsonBody(request);
          const tenantId = buildTenantScope(session, payload);
          const updated = await studentService.updateStudent(tenantId, studentId, payload);
          if (!updated) {
            sendApiError(response, buildNotFoundError('Student not found'));
            return true;
          }
          auditWriter.writeEntityEvent(session, 'student.update', 'student', updated.id);
          sendApiSuccess(response, updated);
        } catch (error) {
          handleRouteError(sendApiError, response, error, { status: 422, code: 'VALIDATION_ERROR', message: 'Validation failed' });
        }
        return true;
      }

      if (request.method === 'DELETE') {
        const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
        const authError = ensureAuthorized(auth);
        if (authError) {
          sendApiError(response, authError);
          return true;
        }

        const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
        const archived = await studentService.archiveStudent(tenantId, studentId);
        if (!archived) {
          sendApiError(response, buildNotFoundError('Student not found'));
          return true;
        }
        auditWriter.writeEntityEvent(session, 'student.archive', 'student', archived.id);
        sendApiSuccess(response, archived);
        return true;
      }
    }

    if (url.pathname === '/api/v1/class-rooms' && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR] });
      const authError = ensureAuthorized(auth);
      if (authError) {
        sendApiError(response, authError);
        return true;
      }
      const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
      sendApiSuccess(response, await studentService.listClassRooms(tenantId));
      return true;
    }

    if (url.pathname === '/api/v1/subjects' && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.TEACHER] });
      const authError = ensureAuthorized(auth);
      if (authError) {
        sendApiError(response, authError);
        return true;
      }
      const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
      sendApiSuccess(response, await studentService.listSubjects(tenantId));
      return true;
    }

    return false;
  };
}

module.exports = { createStudentRoutes };
