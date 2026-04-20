const crypto = require('node:crypto');

/**
 * @typedef {'super_admin'|'school_admin'|'director'|'teacher'|'parent'|'student'|'accountant'} Role
 *
 * @typedef Session
 * @property {string} id
 * @property {string} userId
 * @property {Role} role
 * @property {string} tenantId
 * @property {number} createdAt
 */

class SessionStore {
  constructor() {
    /** @type {Map<string, Session>} */
    this.sessions = new Map();
  }

  /**
   * @param {{ userId: string, role: Role, tenantId: string }} payload
   * @returns {Session}
   */
  create(payload) {
    const id = crypto.randomUUID();
    const session = {
      id,
      userId: payload.userId,
      role: payload.role,
      tenantId: payload.tenantId,
      createdAt: Date.now()
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

    return this.sessions.get(sessionId) ?? null;
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
}

module.exports = {
  SessionStore
};
