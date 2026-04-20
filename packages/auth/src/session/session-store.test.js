const test = require('node:test');
const assert = require('node:assert/strict');

const { SessionStore } = require('./session-store');
const { toSessionContext } = require('./session-context');

test('SessionStore crée une session avec userId, role et tenantId', () => {
  const store = new SessionStore();

  const session = store.create({
    userId: 'user-1',
    role: 'teacher',
    tenantId: 'school-a'
  });

  assert.equal(typeof session.id, 'string');
  assert.equal(session.userId, 'user-1');
  assert.equal(session.role, 'teacher');
  assert.equal(session.tenantId, 'school-a');
});

test('toSessionContext expose le contexte complet pour une session authentifiée', () => {
  const context = toSessionContext({
    id: 'session-1',
    userId: 'user-1',
    role: 'parent',
    tenantId: 'school-a',
    createdAt: Date.now()
  });

  assert.deepEqual(context, {
    isAuthenticated: true,
    userId: 'user-1',
    role: 'parent',
    tenantId: 'school-a'
  });
});

test('toSessionContext renvoie un contexte anonyme pour un visiteur', () => {
  assert.deepEqual(toSessionContext(null), {
    isAuthenticated: false,
    userId: null,
    role: null,
    tenantId: null
  });
});
