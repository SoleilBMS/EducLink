const DEFAULT_WINDOW_MS = 1000 * 60 * 15;
const DEFAULT_MAX_FAILURES = 5;
const DEFAULT_LOCK_DURATION_MS = 1000 * 60 * 15;

class LoginThrottle {
  constructor(options = {}) {
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.maxFailures = options.maxFailures ?? DEFAULT_MAX_FAILURES;
    this.lockDurationMs = options.lockDurationMs ?? DEFAULT_LOCK_DURATION_MS;
    this.clock = options.clock ?? Date.now;
    this.entries = new Map();
  }

  isLocked(key) {
    const entry = this.entries.get(key);
    if (!entry) {
      return false;
    }
    const now = this.clock();
    if (entry.lockedUntil && entry.lockedUntil > now) {
      return true;
    }
    if (entry.lockedUntil && entry.lockedUntil <= now) {
      this.entries.delete(key);
    }
    return false;
  }

  retryAfterSeconds(key) {
    const entry = this.entries.get(key);
    if (!entry || !entry.lockedUntil) {
      return 0;
    }
    const now = this.clock();
    const remainingMs = entry.lockedUntil - now;
    return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
  }

  recordFailure(key) {
    const now = this.clock();
    const entry = this.entries.get(key);

    if (!entry || now - entry.windowStart > this.windowMs) {
      this.entries.set(key, { failures: 1, windowStart: now, lockedUntil: null });
      return;
    }

    entry.failures += 1;
    if (entry.failures >= this.maxFailures) {
      entry.lockedUntil = now + this.lockDurationMs;
    }
  }

  reset(key) {
    this.entries.delete(key);
  }
}

module.exports = {
  LoginThrottle,
  DEFAULT_WINDOW_MS,
  DEFAULT_MAX_FAILURES,
  DEFAULT_LOCK_DURATION_MS
};
