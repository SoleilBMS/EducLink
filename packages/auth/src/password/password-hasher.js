const bcrypt = require('bcryptjs');

const DEFAULT_COST = 10;
const TEST_COST = 4;

function getCost() {
  return process.env.NODE_ENV === 'test' ? TEST_COST : DEFAULT_COST;
}

let cachedDummyHash = null;
function getDummyHash() {
  if (!cachedDummyHash) {
    cachedDummyHash = bcrypt.hashSync('__dummy_compare_target__', getCost());
  }
  return cachedDummyHash;
}

function hashPasswordSync(plainPassword) {
  if (typeof plainPassword !== 'string' || plainPassword.length === 0) {
    throw new Error('hashPasswordSync requires a non-empty string');
  }
  return bcrypt.hashSync(plainPassword, getCost());
}

async function hashPassword(plainPassword) {
  if (typeof plainPassword !== 'string' || plainPassword.length === 0) {
    throw new Error('hashPassword requires a non-empty string');
  }
  return bcrypt.hash(plainPassword, getCost());
}

async function verifyPassword(plainPassword, passwordHash) {
  const plain = typeof plainPassword === 'string' ? plainPassword : '';
  const hash = typeof passwordHash === 'string' && passwordHash.length > 0 ? passwordHash : getDummyHash();
  const matched = await bcrypt.compare(plain, hash);
  return Boolean(passwordHash) && matched;
}

module.exports = {
  hashPassword,
  hashPasswordSync,
  verifyPassword
};
