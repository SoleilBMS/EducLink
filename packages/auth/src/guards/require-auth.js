const { isRole, ROLES } = require('../roles/roles');
const { toSessionContext } = require('../session/session-context');

function isUsableSession(session) {
  if (!session) {
    return false;
  }

  if (!isRole(session.role)) {
    return false;
  }

  if (!session.userId || typeof session.userId !== 'string') {
    return false;
  }

  if (session.role !== ROLES.SUPER_ADMIN && !session.tenantId) {
    return false;
  }

  return true;
}

/**
 * @param {import('../session/session-store').Session | null} session
 * @returns {{ allowed: true, context: ReturnType<typeof toSessionContext> } | { allowed: false, redirectTo: '/login' }}
 */
function requireAuth(session) {
  if (!isUsableSession(session)) {
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
