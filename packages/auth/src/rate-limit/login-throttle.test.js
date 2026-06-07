const test = require('node:test');
const assert = require('node:assert/strict');

const { LoginThrottle } = require('./login-throttle');

test('LoginThrottle laisse passer en dessous du seuil', () => {
  const throttle = new LoginThrottle({ maxFailures: 5, windowMs: 60_000, lockDurationMs: 60_000 });
  for (let i = 0; i < 4; i += 1) {
    throttle.recordFailure('ip-1');
  }
  assert.equal(throttle.isLocked('ip-1'), false);
});

test('LoginThrottle verrouille au Nième échec', () => {
  const throttle = new LoginThrottle({ maxFailures: 5, windowMs: 60_000, lockDurationMs: 60_000 });
  for (let i = 0; i < 5; i += 1) {
    throttle.recordFailure('ip-1');
  }
  assert.equal(throttle.isLocked('ip-1'), true);
  assert.ok(throttle.retryAfterSeconds('ip-1') > 0);
});

test('LoginThrottle reset remet le compteur à zéro', () => {
  const throttle = new LoginThrottle({ maxFailures: 3, windowMs: 60_000, lockDurationMs: 60_000 });
  throttle.recordFailure('ip-1');
  throttle.recordFailure('ip-1');
  throttle.reset('ip-1');
  assert.equal(throttle.isLocked('ip-1'), false);
});

test('LoginThrottle libère après lockDurationMs', () => {
  let now = 1_000;
  const throttle = new LoginThrottle({
    maxFailures: 2,
    windowMs: 60_000,
    lockDurationMs: 5_000,
    clock: () => now
  });
  throttle.recordFailure('ip-1');
  throttle.recordFailure('ip-1');
  assert.equal(throttle.isLocked('ip-1'), true);

  now += 6_000;
  assert.equal(throttle.isLocked('ip-1'), false);
});

test('LoginThrottle isole les clés (IPs différentes)', () => {
  const throttle = new LoginThrottle({ maxFailures: 2, windowMs: 60_000, lockDurationMs: 60_000 });
  throttle.recordFailure('ip-1');
  throttle.recordFailure('ip-1');
  assert.equal(throttle.isLocked('ip-1'), true);
  assert.equal(throttle.isLocked('ip-2'), false);
});

test('LoginThrottle réinitialise la fenêtre quand windowMs expire', () => {
  let now = 1_000;
  const throttle = new LoginThrottle({
    maxFailures: 3,
    windowMs: 1_000,
    lockDurationMs: 60_000,
    clock: () => now
  });
  throttle.recordFailure('ip-1');
  throttle.recordFailure('ip-1');
  now += 5_000;
  throttle.recordFailure('ip-1');
  assert.equal(throttle.isLocked('ip-1'), false);
});
