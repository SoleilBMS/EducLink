const crypto = require('node:crypto');

const { generateCsrfToken } = require('../csrf/csrf');

/**
 * @typedef {'super_admin'|'school_admin'|'director'|'teacher'|'parent'|'student'|'accountant'} Role
 *
 * @typedef Session
 * @property {string} id
 * @property {string} userId
 * @property {Role} role
 * @property {string | null} tenantId
 * @property {number} createdAt
 * @property {number} expiresAt
 * @property {string} csrfToken
 */

const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 12;

function signSessionId(sessionId, secret) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new Error('signSessionId requires a non-empty sessionId');
  }
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error('signSessionId requires a non-empty secret');
  }
  const signature = crypto.createHmac('sha256', secret).update(sessionId).digest('hex');
  return `${sessionId}.${signature}`;
}

function verifySignedSessionId(signedValue, secret) {
  if (typeof signedValue !== 'string' || signedValue.length === 0) {
    return null;
  }
  const dotIndex = signedValue.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === signedValue.length - 1) {
    return null;
  }
  const sessionId = signedValue.slice(0, dotIndex);
  const providedSignature = signedValue.slice(dotIndex + 1);
  let expectedSignature;
  try {
    expectedSignature = crypto.createHmac('sha256', secret).update(sessionId).digest('hex');
  } catch {
    return null;
  }
  if (providedSignature.length !== expectedSignature.length) {
    return null;
  }
  const providedBuffer = Buffer.from(providedSignature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }
  return sessionId;
}

class SessionStore {
  /**
   * @param {{ ttlMs?: number, clock?: () => number }} [options]
   */
  constructor(options = {}) {
    /** @type {Map<string, Session>} */
    this.sessions = new Map();
    this.ttlMs = options.ttlMs ?? DEFAULT_SESSION_TTL_MS;
    this.clock = options.clock ?? Date.now;
  }

  /**
   * @param {{ userId: string, role: Role, tenantId: string | null }} payload
   * @returns {Session}
   */
  create(payload) {
    const now = this.clock();
    const id = crypto.randomUUID();
    const session = {
      id,
      userId: payload.userId,
      role: payload.role,
      tenantId: payload.tenantId,
      createdAt: now,
      expiresAt: now + this.ttlMs,
      csrfToken: generateCsrfToken()
    };

    this.sessions.set(id, session);
    return session;
  }

  /**
   * @param {string | undefined} sessionId
   * @returns {Session | null}
   */
  get(sessionId) {
    if (!sessionId) {
      return null;
    }

    const session = this.sessions.get(sessionId);
    if (!this.#isValidSessionShape(session)) {
      this.sessions.delete(sessionId);
      return null;
    }

    const now = this.clock();
    if (session.expiresAt <= now) {
      this.sessions.delete(sessionId);
      return null;
    }

    return session;
  }

  /**
   * @param {string | undefined} sessionId
   * @returns {boolean}
   */
  destroy(sessionId) {
    if (!sessionId) {
      return false;
    }

    return this.sessions.delete(sessionId);
  }

  /**
   * @param {Session | undefined} session
   * @returns {session is Session}
   */
  #isValidSessionShape(session) {
    if (!session) {
      return false;
    }

    return (
      typeof session.id === 'string' &&
      typeof session.userId === 'string' &&
      typeof session.role === 'string' &&
      typeof session.createdAt === 'number' &&
      typeof session.expiresAt === 'number' &&
      typeof session.csrfToken === 'string' &&
      (typeof session.tenantId === 'string' || session.tenantId === null)
    );
  }
}

module.exports = {
  DEFAULT_SESSION_TTL_MS,
  SessionStore,
  signSessionId,
  verifySignedSessionId
};
