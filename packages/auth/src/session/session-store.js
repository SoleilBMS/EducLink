const crypto = require('node:crypto');

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
 */

const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 12;

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
      expiresAt: now + this.ttlMs
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
      (typeof session.tenantId === 'string' || session.tenantId === null)
    );
  }
}

module.exports = {
  DEFAULT_SESSION_TTL_MS,
  SessionStore
};
