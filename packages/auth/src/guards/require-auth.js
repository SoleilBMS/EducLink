const { toSessionContext } = require('../session/session-context');

/**
 * @param {import('../session/session-store').Session | null} session
 * @returns {{ allowed: true, context: ReturnType<typeof toSessionContext> } | { allowed: false, redirectTo: '/login' }}
 */
function requireAuth(session) {
  if (!session) {
    return {
      allowed: false,
      redirectTo: '/login'
    };
  }

  return {
    allowed: true,
    context: toSessionContext(session)
  };
}

module.exports = {
  requireAuth
};
