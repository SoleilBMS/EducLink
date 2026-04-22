const { ROLES } = require('../../../../packages/auth/src/roles/roles');
const { authorizeApiRequest } = require('../../../../packages/auth/src/guards/api-guard');

function createTeacherRoutes({ teacherService, auditWriter, sendApiError, sendApiSuccess, parseJsonBody, buildTenantScope }) {
  return async function handleTeacherRoutes({ request, response, url, session }) {
    if (url.pathname === '/api/v1/teachers' && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return true;
      }

      const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
      sendApiSuccess(response, teacherService.listTeachers(tenantId));
      return true;
    }

    if (url.pathname === '/api/v1/teachers' && request.method === 'POST') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return true;
      }

      try {
        const payload = await parseJsonBody(request);
        const tenantId = buildTenantScope(session, payload);
        const teacher = teacherService.createTeacher(tenantId, payload);
        auditWriter.writeEntityEvent(session, 'teacher.create', 'teacher', teacher.id);
        sendApiSuccess(response, teacher, 201);
      } catch (error) {
        sendApiError(response, error.status ?? 422, error.code ?? 'VALIDATION_ERROR', error.message);
      }
      return true;
    }

    const teacherByIdMatch = url.pathname.match(/^\/api\/v1\/teachers\/([^/]+)$/);
    if (teacherByIdMatch) {
      const teacherId = teacherByIdMatch[1];
      if (request.method === 'GET') {
        const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
        if (!auth.ok) {
          sendApiError(response, auth.status, auth.error.code, auth.error.message);
          return true;
        }

        const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
        const teacher = teacherService.getTeacher(tenantId, teacherId);
        if (!teacher) {
          sendApiError(response, 404, 'NOT_FOUND', 'Teacher not found');
          return true;
        }
        sendApiSuccess(response, teacher);
        return true;
      }

      if (request.method === 'PUT') {
        const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
        if (!auth.ok) {
          sendApiError(response, auth.status, auth.error.code, auth.error.message);
          return true;
        }

        try {
          const payload = await parseJsonBody(request);
          const tenantId = buildTenantScope(session, payload);
          const updated = teacherService.updateTeacher(tenantId, teacherId, payload);
          if (!updated) {
            sendApiError(response, 404, 'NOT_FOUND', 'Teacher not found');
            return true;
          }
          auditWriter.writeEntityEvent(session, 'teacher.update', 'teacher', updated.id);
          sendApiSuccess(response, updated);
        } catch (error) {
          sendApiError(response, error.status ?? 422, error.code ?? 'VALIDATION_ERROR', error.message);
        }
        return true;
      }

      if (request.method === 'DELETE') {
        const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
        if (!auth.ok) {
          sendApiError(response, auth.status, auth.error.code, auth.error.message);
          return true;
        }

        const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
        const archived = teacherService.archiveTeacher(tenantId, teacherId);
        if (!archived) {
          sendApiError(response, 404, 'NOT_FOUND', 'Teacher not found');
          return true;
        }
        auditWriter.writeEntityEvent(session, 'teacher.archive', 'teacher', archived.id);
        sendApiSuccess(response, archived);
        return true;
      }
    }

    return false;
  };
}

module.exports = { createTeacherRoutes };
