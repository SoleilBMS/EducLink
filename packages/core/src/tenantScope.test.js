const test = require('node:test');
const assert = require('node:assert/strict');

const { filterByTenant, isSameTenant, resolveTenantScope } = require('./tenantScope');

test('isSameTenant retourne true quand tenant_id correspond', () => {
  assert.equal(isSameTenant({ tenant_id: 'school-a' }, 'school-a'), true);
});

test('isSameTenant retourne false quand tenant_id est différent', () => {
  assert.equal(isSameTenant({ tenant_id: 'school-a' }, 'school-b'), false);
});

test('isSameTenant retourne false pour les ressources invalides', () => {
  assert.equal(isSameTenant(null, 'school-a'), false);
  assert.equal(isSameTenant({}, 'school-a'), false);
});

test('filterByTenant ne renvoie que les ressources du tenant demandé', () => {
  const resources = [
    { id: '1', tenant_id: 'school-a' },
    { id: '2', tenant_id: 'school-b' },
    { id: '3', tenant_id: 'school-a' }
  ];

  assert.deepEqual(filterByTenant(resources, 'school-a'), [
    { id: '1', tenant_id: 'school-a' },
    { id: '3', tenant_id: 'school-a' }
  ]);
});

test('filterByTenant retourne un tableau vide si la collection est invalide', () => {
  assert.deepEqual(filterByTenant(null, 'school-a'), []);
});

test('resolveTenantScope force tenant explicite pour super_admin', () => {
  assert.equal(resolveTenantScope({ isSuperAdmin: true, requestedTenantId: 'school-a' }), 'school-a');

  assert.throws(
    () => resolveTenantScope({ isSuperAdmin: true }),
    (error) => error.code === 'TENANT_SCOPE_REQUIRED' && error.status === 400
  );
});

test('resolveTenantScope applique le tenant de session pour les rôles établissement', () => {
  assert.equal(
    resolveTenantScope({ sessionTenantId: 'school-a', requestedTenantId: 'school-a', isSuperAdmin: false }),
    'school-a'
  );

  assert.throws(
    () => resolveTenantScope({ sessionTenantId: 'school-a', requestedTenantId: 'school-b', isSuperAdmin: false }),
    (error) => error.code === 'FORBIDDEN' && error.status === 403
  );
});
