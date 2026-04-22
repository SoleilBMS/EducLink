const { ROLES } = require('../../../../packages/auth/src/roles/roles');
const { authorizeApiRequest } = require('../../../../packages/auth/src/guards/api-guard');

function createParentRoutes({ parentStore, studentStore, auditWriter, sendApiError, sendApiSuccess, parseJsonBody, buildTenantScope, buildValidationError }) {
  return async function handleParentRoutes({ request, response, url, session }) {
    if (url.pathname === '/api/v1/parents' && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return true;
      }

      const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
      sendApiSuccess(response, parentStore.list(tenantId));
      return true;
    }

    if (url.pathname === '/api/v1/parents' && request.method === 'POST') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return true;
      }

      try {
        const payload = await parseJsonBody(request);
        const tenantId = buildTenantScope(session, payload);
        const parent = parentStore.create(tenantId, payload);
        auditWriter.writeEntityEvent(session, 'parent.create', 'parent', parent.id);
        sendApiSuccess(response, parent, 201);
      } catch (error) {
        sendApiError(response, error.status ?? 422, error.code ?? 'VALIDATION_ERROR', error.message);
      }
      return true;
    }

    const parentByIdMatch = url.pathname.match(/^\/api\/v1\/parents\/([^/]+)$/);
    if (parentByIdMatch) {
      const parentId = parentByIdMatch[1];
      if (request.method === 'GET') {
        const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
        if (!auth.ok) {
          sendApiError(response, auth.status, auth.error.code, auth.error.message);
          return true;
        }

        const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
        const parent = parentStore.getParentWithLinks(tenantId, parentId);
        if (!parent) {
          sendApiError(response, 404, 'NOT_FOUND', 'Parent not found');
          return true;
        }
        sendApiSuccess(response, parent);
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
          const updated = parentStore.update(tenantId, parentId, payload);
          if (!updated) {
            sendApiError(response, 404, 'NOT_FOUND', 'Parent not found');
            return true;
          }
          auditWriter.writeEntityEvent(session, 'parent.update', 'parent', updated.id);
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
        const archived = parentStore.archive(tenantId, parentId);
        if (!archived) {
          sendApiError(response, 404, 'NOT_FOUND', 'Parent not found');
          return true;
        }
        auditWriter.writeEntityEvent(session, 'parent.archive', 'parent', archived.id);
        sendApiSuccess(response, archived);
        return true;
      }
    }

    const parentLinksMatch = url.pathname.match(/^\/api\/v1\/parents\/([^/]+)\/links$/);
    if (parentLinksMatch && request.method === 'POST') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return true;
      }

      try {
        const payload = await parseJsonBody(request);
        const tenantId = buildTenantScope(session, payload);
        if (!Array.isArray(payload.studentIds) || payload.studentIds.length === 0) {
          throw buildValidationError('studentIds must be a non-empty array');
        }

        const links = payload.studentIds.map((studentId) =>
          parentStore.upsertLink(tenantId, parentLinksMatch[1], studentId, {
            relationship: payload.relationship,
            isPrimaryContact: payload.isPrimaryContact
          })
        );

        sendApiSuccess(response, links, 201);
      } catch (error) {
        sendApiError(response, error.status ?? 422, error.code ?? 'VALIDATION_ERROR', error.message);
      }
      return true;
    }

    const studentParentsMatch = url.pathname.match(/^\/api\/v1\/students\/([^/]+)\/parents$/);
    if (studentParentsMatch && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
      if (!auth.ok) {
        sendApiError(response, auth.status, auth.error.code, auth.error.message);
        return true;
      }

      const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
      const student = studentStore.get(tenantId, studentParentsMatch[1], { includeArchived: false });
      if (!student) {
        sendApiError(response, 404, 'NOT_FOUND', 'Student not found');
        return true;
      }

      const links = parentStore.listLinksByStudent(tenantId, studentParentsMatch[1]).map((link) => ({
        ...link,
        parent: parentStore.get(tenantId, link.parentId, { includeArchived: true })
      }));
      sendApiSuccess(response, links);
      return true;
    }

    return false;
  };
}

module.exports = { createParentRoutes };
