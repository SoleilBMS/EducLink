/**
 * Structure minimale pour le flow forgot/reset password.
 * L'implémentation des tokens et des notifications sera ajoutée plus tard.
 */

/**
 * @param {string} email
 * @returns {{ status: 'queued', email: string }}
 */
function requestPasswordReset(email) {
  return {
    status: 'queued',
    email
  };
}

/**
 * @param {{ token: string, newPassword: string }} payload
 * @returns {{ status: 'not_implemented', token: string }}
 */
function resetPassword(payload) {
  return {
    status: 'not_implemented',
    token: payload.token
  };
}

module.exports = {
  requestPasswordReset,
  resetPassword
};
