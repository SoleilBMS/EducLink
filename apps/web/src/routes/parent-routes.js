const { ROLES } = require('../../../../packages/auth/src/roles/roles');
const { authorizeApiRequest } = require('../../../../packages/auth/src/guards/api-guard');
const { buildNotFoundError, ensureAuthorized, handleRouteError } = require('./error-helpers');

function createParentRoutes({ parentService, auditWriter, sendApiError, sendApiSuccess, parseJsonBody, buildTenantScope }) {
  return async function handleParentRoutes({ request, response, url, session }) {
    if (url.pathname === '/api/v1/parents' && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
      const authError = ensureAuthorized(auth);
      if (authError) {
        sendApiError(response, authError);
        return true;
      }

      const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
      sendApiSuccess(response, parentService.listParents(tenantId));
      return true;
    }

    if (url.pathname === '/api/v1/parents' && request.method === 'POST') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
      const authError = ensureAuthorized(auth);
      if (authError) {
        sendApiError(response, authError);
        return true;
      }

      try {
        const payload = await parseJsonBody(request);
        const tenantId = buildTenantScope(session, payload);
        const parent = parentService.createParent(tenantId, payload);
        auditWriter.writeEntityEvent(session, 'parent.create', 'parent', parent.id);
        sendApiSuccess(response, parent, 201);
      } catch (error) {
        handleRouteError(sendApiError, response, error, { status: 422, code: 'VALIDATION_ERROR', message: 'Validation failed' });
      }
      return true;
    }

    const parentByIdMatch = url.pathname.match(/^\/api\/v1\/parents\/([^/]+)$/);
    if (parentByIdMatch) {
      const parentId = parentByIdMatch[1];
      if (request.method === 'GET') {
        const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
        const authError = ensureAuthorized(auth);
        if (authError) {
          sendApiError(response, authError);
          return true;
        }

        const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
        const parent = parentService.getParentWithLinks(tenantId, parentId);
        if (!parent) {
          sendApiError(response, buildNotFoundError('Parent not found'));
          return true;
        }
        sendApiSuccess(response, parent);
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
          const updated = parentService.updateParent(tenantId, parentId, payload);
          if (!updated) {
            sendApiError(response, buildNotFoundError('Parent not found'));
            return true;
          }
          auditWriter.writeEntityEvent(session, 'parent.update', 'parent', updated.id);
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
        const archived = parentService.archiveParent(tenantId, parentId);
        if (!archived) {
          sendApiError(response, buildNotFoundError('Parent not found'));
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
      const authError = ensureAuthorized(auth);
      if (authError) {
        sendApiError(response, authError);
        return true;
      }

      try {
        const payload = await parseJsonBody(request);
        const tenantId = buildTenantScope(session, payload);
        const links = parentService.upsertParentLinks(tenantId, parentLinksMatch[1], payload);

        sendApiSuccess(response, links, 201);
      } catch (error) {
        handleRouteError(sendApiError, response, error, { status: 422, code: 'VALIDATION_ERROR', message: 'Validation failed' });
      }
      return true;
    }

    const studentParentsMatch = url.pathname.match(/^\/api\/v1\/students\/([^/]+)\/parents$/);
    if (studentParentsMatch && request.method === 'GET') {
      const auth = authorizeApiRequest(session, null, { allowedRoles: [ROLES.SCHOOL_ADMIN] });
      const authError = ensureAuthorized(auth);
      if (authError) {
        sendApiError(response, authError);
        return true;
      }

      const tenantId = buildTenantScope(session, Object.fromEntries(url.searchParams));
      const links = parentService.listParentsForStudent(tenantId, studentParentsMatch[1]);
      if (!links) {
        sendApiError(response, buildNotFoundError('Student not found'));
        return true;
      }

      sendApiSuccess(response, links);
      return true;
    }

    return false;
  };
}

module.exports = { createParentRoutes };
