/**
 * @typedef {{ tenant_id: string }} TenantScoped
 */

/**
 * Vérifie que la ressource appartient au tenant courant.
 *
 * @param {TenantScoped} resource
 * @param {string} tenantId
 * @returns {boolean}
 */
function isSameTenant(resource, tenantId) {
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
  return resources.filter((resource) => isSameTenant(resource, tenantId));
}

module.exports = {
  isSameTenant,
  filterByTenant
};
