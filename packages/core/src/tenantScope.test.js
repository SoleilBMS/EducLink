const test = require('node:test');
const assert = require('node:assert/strict');

const { filterByTenant, isSameTenant } = require('./tenantScope');

test('isSameTenant retourne true quand tenant_id correspond', () => {
  assert.equal(isSameTenant({ tenant_id: 'school-a' }, 'school-a'), true);
});

test('isSameTenant retourne false quand tenant_id est différent', () => {
  assert.equal(isSameTenant({ tenant_id: 'school-a' }, 'school-b'), false);
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
