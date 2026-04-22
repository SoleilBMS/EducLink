const { canAccessTenantResource } = require('../permissions/permissions');
const { isRole, ROLES } = require('../roles/roles');


function hasValidSessionIdentity(session) {
  if (!session) {
    return false;
  }

  if (typeof session.userId !== 'string' || session.userId.length === 0) {
    return false;
  }

  if (!isRole(session.role)) {
    return false;
  }

  if (session.role !== ROLES.SUPER_ADMIN && !session.tenantId) {
    return false;
  }

  return true;
}

function buildError(status, code, message) {
  return {
    ok: false,
    status,
    error: {
      code,
      message
    }
  };
}

/**
 * @param {{ role: string, tenantId: string } | null} session
 * @param {{ tenant_id: string } | null} resource
 * @param {{ allowedRoles?: string[], allowSuperAdminGlobal?: boolean }} [options]
 * @returns {{ ok: true } | { ok: false, status: number, error: { code: string, message: string } }}
 */
function authorizeApiRequest(session, resource, options = {}) {
  if (!session) {
    return buildError(401, 'UNAUTHORIZED', 'Authentication required');
  }

  if (!hasValidSessionIdentity(session)) {
    return buildError(401, 'UNAUTHORIZED', 'Invalid session context');
  }

  if (options.allowedRoles && !options.allowedRoles.includes(session.role)) {
    return buildError(403, 'FORBIDDEN', 'You do not have permission for this action');
  }

  if (resource && !canAccessTenantResource(resource, session, { allowSuperAdminGlobal: options.allowSuperAdminGlobal })) {
    return buildError(403, 'FORBIDDEN', 'Cross-tenant access denied');
  }

  if (!resource && session.role !== ROLES.SUPER_ADMIN && !session.tenantId) {
    return buildError(400, 'TENANT_SCOPE_REQUIRED', 'Tenant scope is required');
  }

  return { ok: true };
}

module.exports = {
  authorizeApiRequest,
  buildError
};
