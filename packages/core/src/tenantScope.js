/**
 * @typedef {{ tenant_id: string }} TenantScoped
 */

/**
 * Vérifie que la ressource appartient au tenant courant.
 *
 * @param {TenantScoped | null | undefined} resource
 * @param {string} tenantId
 * @returns {boolean}
 */
function isSameTenant(resource, tenantId) {
  if (!resource || typeof resource.tenant_id !== 'string') {
    return false;
  }

  return resource.tenant_id === tenantId;
}

/**
 * Filtre une collection de ressources selon le tenant courant.
 *
 * @template {TenantScoped} T
 * @param {T[]} resources
 * @param {string} tenantId
 * @returns {T[]}
 */
function filterByTenant(resources, tenantId) {
  if (!Array.isArray(resources)) {
    return [];
  }

  return resources.filter((resource) => isSameTenant(resource, tenantId));
}

/**
 * Résout le tenant effectif d'une requête en tenant compte du rôle.
 *
 * @param {{ sessionTenantId?: string | null, requestedTenantId?: string | null, isSuperAdmin?: boolean }} input
 * @returns {string}
 */
function resolveTenantScope({ sessionTenantId, requestedTenantId, isSuperAdmin = false }) {
  if (isSuperAdmin) {
    if (typeof requestedTenantId === 'string' && requestedTenantId.length > 0) {
      return requestedTenantId;
    }

    const error = new Error('tenantId is required for super_admin tenant-scoped requests');
    error.code = 'TENANT_SCOPE_REQUIRED';
    error.status = 400;
    throw error;
  }

  if (typeof sessionTenantId !== 'string' || sessionTenantId.length === 0) {
    const error = new Error('tenantId is required in session context');
    error.code = 'TENANT_SCOPE_REQUIRED';
    error.status = 400;
    throw error;
  }

  if (requestedTenantId && requestedTenantId !== sessionTenantId) {
    const error = new Error('Cross-tenant access denied');
    error.code = 'FORBIDDEN';
    error.status = 403;
    throw error;
  }

  return sessionTenantId;
}

module.exports = {
  isSameTenant,
  filterByTenant,
  resolveTenantScope
};
