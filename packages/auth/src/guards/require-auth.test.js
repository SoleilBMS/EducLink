const test = require('node:test');
const assert = require('node:assert/strict');

const { requireAuth } = require('./require-auth');

test('requireAuth redirige vers /login si non authentifié', () => {
  assert.deepEqual(requireAuth(null), {
    allowed: false,
    redirectTo: '/login'
  });
});

test('requireAuth refuse une session incohérente', () => {
  assert.deepEqual(
    requireAuth({
      id: 'session-1',
      userId: 'user-1',
      role: 'unknown',
      tenantId: 'school-a',
      createdAt: Date.now(),
      expiresAt: Date.now() + 1000
    }),
    {
      allowed: false,
      redirectTo: '/login'
    }
  );
});

test('requireAuth autorise avec contexte session si authentifié', () => {
  const result = requireAuth({
    id: 'session-1',
    userId: 'user-1',
    role: 'school_admin',
    tenantId: 'school-a',
    createdAt: Date.now(),
    expiresAt: Date.now() + 1000
  });

  assert.equal(result.allowed, true);
  assert.deepEqual(result.context, {
    isAuthenticated: true,
    userId: 'user-1',
    role: 'school_admin',
    tenantId: 'school-a'
  });
});
