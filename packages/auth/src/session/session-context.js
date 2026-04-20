/**
 * @param {import('./session-store').Session | null} session
 * @returns {{ isAuthenticated: boolean, userId: string | null, role: string | null, tenantId: string | null }}
 */
function toSessionContext(session) {
  if (!session) {
    return {
      isAuthenticated: false,
      userId: null,
      role: null,
      tenantId: null
    };
  }

  return {
    isAuthenticated: true,
    userId: session.userId,
    role: session.role,
    tenantId: session.tenantId
  };
}

module.exports = {
  toSessionContext
};
