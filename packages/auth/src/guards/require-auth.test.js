const test = require('node:test');
const assert = require('node:assert/strict');

const { requireAuth } = require('./require-auth');

test('requireAuth redirige vers /login si non authentifié', () => {
  assert.deepEqual(requireAuth(null), {
    allowed: false,
    redirectTo: '/login'
  });
});

test('requireAuth autorise avec contexte session si authentifié', () => {
  const result = requireAuth({
    id: 'session-1',
    userId: 'user-1',
    role: 'school_admin',
    tenantId: 'school-a',
    createdAt: Date.now()
  });

  assert.equal(result.allowed, true);
  assert.deepEqual(result.context, {
    isAuthenticated: true,
    userId: 'user-1',
    role: 'school_admin',
    tenantId: 'school-a'
  });
});
