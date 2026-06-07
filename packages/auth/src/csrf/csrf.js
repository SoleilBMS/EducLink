const crypto = require('node:crypto');

const TOKEN_BYTES = 32;

function generateCsrfToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

function compareCsrfTokens(expected, actual) {
  if (typeof expected !== 'string' || typeof actual !== 'string') {
    return false;
  }
  if (expected.length === 0 || expected.length !== actual.length) {
    return false;
  }
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const actualBuffer = Buffer.from(actual, 'utf8');
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

module.exports = {
  generateCsrfToken,
  compareCsrfTokens
};
