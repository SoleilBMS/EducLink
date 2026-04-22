const test = require('node:test');
const assert = require('node:assert/strict');

const { authorizeApiRequest } = require('./api-guard');

test('authorizeApiRequest retourne UNAUTHORIZED sans session', () => {
  const result = authorizeApiRequest(null, null);
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(result.error.code, 'UNAUTHORIZED');
});

test('authorizeApiRequest rejette une session invalide', () => {
  const result = authorizeApiRequest({ role: 'unknown', tenantId: 'school-a', userId: 'user-1' }, null);
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(result.error.code, 'UNAUTHORIZED');
});

test('authorizeApiRequest bloque accès cross-tenant', () => {
  const result = authorizeApiRequest(
    { role: 'school_admin', tenantId: 'school-a', userId: 'admin-a' },
    { tenant_id: 'school-b' }
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.error.code, 'FORBIDDEN');
});

test('authorizeApiRequest autorise super_admin en accès global contrôlé', () => {
  const result = authorizeApiRequest(
    { role: 'super_admin', tenantId: null, userId: 'super-admin' },
    { tenant_id: 'school-b' },
    { allowSuperAdminGlobal: true }
  );

  assert.deepEqual(result, { ok: true });
});
