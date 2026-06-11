const { test } = require('node:test');
const assert = require('node:assert/strict');

const { toSessionContext } = require('./session-context');

test('toSessionContext returns anonymous context when session is null', () => {
  const context = toSessionContext(null);
  assert.deepEqual(context, {
    isAuthenticated: false,
    userId: null,
    role: null,
    tenantId: null,
    csrfToken: null
  });
});

test('toSessionContext propagates csrfToken so render helpers can mint CSRF inputs', () => {
  const session = {
    id: 'sess-1',
    userId: 'admin-a',
    role: 'school_admin',
    tenantId: 'school-a',
    createdAt: 0,
    expiresAt: 1,
    csrfToken: 'token-abc123'
  };

  const context = toSessionContext(session);

  assert.equal(context.isAuthenticated, true);
  assert.equal(context.userId, 'admin-a');
  assert.equal(context.role, 'school_admin');
  assert.equal(context.tenantId, 'school-a');
  assert.equal(context.csrfToken, 'token-abc123');
});
