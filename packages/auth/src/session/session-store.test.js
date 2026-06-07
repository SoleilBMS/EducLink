const test = require('node:test');
const assert = require('node:assert/strict');

const { SessionStore, signSessionId, verifySignedSessionId } = require('./session-store');
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
  assert.equal(typeof session.expiresAt, 'number');
  assert.ok(session.expiresAt > session.createdAt);
});

test('SessionStore invalide les sessions expirées', () => {
  let now = 1_000;
  const store = new SessionStore({ ttlMs: 500, clock: () => now });
  const session = store.create({
    userId: 'user-1',
    role: 'teacher',
    tenantId: 'school-a'
  });

  assert.ok(store.get(session.id));

  now = 1_501;
  assert.equal(store.get(session.id), null);
  assert.equal(store.destroy(session.id), false);
});

test('toSessionContext expose le contexte complet pour une session authentifiée', () => {
  const context = toSessionContext({
    id: 'session-1',
    userId: 'user-1',
    role: 'parent',
    tenantId: 'school-a',
    createdAt: Date.now(),
    expiresAt: Date.now() + 1000
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

test('SessionStore.create attache un csrfToken à chaque session', () => {
  const store = new SessionStore();
  const session = store.create({ userId: 'u', role: 'teacher', tenantId: 's' });
  assert.equal(typeof session.csrfToken, 'string');
  assert.equal(session.csrfToken.length, 64);
});

test('signSessionId puis verifySignedSessionId restitue le sessionId original', () => {
  const secret = 'a-secret-of-sufficient-length-1234';
  const sessionId = 'sess-1234';
  const signed = signSessionId(sessionId, secret);
  assert.equal(signed.includes('.'), true);
  assert.equal(verifySignedSessionId(signed, secret), sessionId);
});

test('verifySignedSessionId refuse une signature falsifiée', () => {
  const secret = 'a-secret-of-sufficient-length-1234';
  const signed = signSessionId('sess-1234', secret);
  const tampered = `${signed.split('.')[0]}.${'0'.repeat(64)}`;
  assert.equal(verifySignedSessionId(tampered, secret), null);
});

test('verifySignedSessionId refuse un secret différent', () => {
  const signed = signSessionId('sess-1234', 'secret-A-with-enough-length-padding');
  assert.equal(verifySignedSessionId(signed, 'secret-B-with-enough-length-padding'), null);
});

test('verifySignedSessionId refuse une valeur sans séparateur', () => {
  assert.equal(verifySignedSessionId('not-signed', 'any-secret'), null);
  assert.equal(verifySignedSessionId('', 'any-secret'), null);
  assert.equal(verifySignedSessionId(null, 'any-secret'), null);
});
