const { hashPasswordSync } = require('../password/password-hasher');

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

class DuplicateEmailError extends Error {
  constructor(email) {
    super(`Email already in use: ${email}`);
    this.code = 'DUPLICATE_EMAIL';
    this.email = email;
  }
}

class InMemoryUserStore {
  constructor({ users = [] } = {}) {
    this.usersByEmail = new Map();
    this.usersById = new Map();
    for (const user of users) {
      this.#index(user);
    }
  }

  #index(user) {
    const stored = {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      role: user.role,
      tenantId: user.tenantId ?? null,
      isActive: user.isActive !== false
    };
    this.usersByEmail.set(normalizeEmail(stored.email), stored);
    this.usersById.set(stored.id, stored);
    return stored;
  }

  async findByEmail(email) {
    const key = normalizeEmail(email);
    if (!key) return null;
    const user = this.usersByEmail.get(key);
    if (!user || !user.isActive) return null;
    return user;
  }

  async getById(id) {
    if (typeof id !== 'string') return null;
    return this.usersById.get(id) ?? null;
  }

  async create({ id, tenantId = null, email, role, passwordHash, isActive = true }) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('InMemoryUserStore.create requires a string id');
    }
    if (typeof email !== 'string' || email.trim().length === 0) {
      throw new Error('InMemoryUserStore.create requires an email');
    }
    if (typeof role !== 'string' || role.length === 0) {
      throw new Error('InMemoryUserStore.create requires a role');
    }
    if (typeof passwordHash !== 'string' || passwordHash.length === 0) {
      throw new Error('InMemoryUserStore.create requires a passwordHash');
    }
    const key = normalizeEmail(email);
    if (this.usersByEmail.has(key)) {
      throw new DuplicateEmailError(email);
    }
    if (this.usersById.has(id)) {
      throw new Error(`User id already exists: ${id}`);
    }
    return this.#index({ id, tenantId, email, role, passwordHash, isActive });
  }

  async update(id, patch = {}) {
    const user = this.usersById.get(id);
    if (!user) return null;
    const next = { ...user };
    if (patch.passwordHash !== undefined) {
      if (typeof patch.passwordHash !== 'string' || patch.passwordHash.length === 0) {
        throw new Error('update.passwordHash must be a non-empty string');
      }
      next.passwordHash = patch.passwordHash;
    }
    if (patch.isActive !== undefined) {
      next.isActive = Boolean(patch.isActive);
    }
    return this.#index(next);
  }

  async listByTenant(tenantId) {
    const target = tenantId ?? null;
    const result = [];
    for (const user of this.usersById.values()) {
      const current = user.tenantId ?? null;
      if (current === target) {
        result.push({ ...user });
      }
    }
    result.sort((a, b) => {
      if (a.role !== b.role) return a.role.localeCompare(b.role);
      return normalizeEmail(a.email).localeCompare(normalizeEmail(b.email));
    });
    return result;
  }
}

function buildSeedUsersWithHashedPassword({ users, plainPassword }) {
  const passwordHash = hashPasswordSync(plainPassword);
  return users.map((user) => ({
    id: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId ?? null,
    passwordHash,
    isActive: true
  }));
}

module.exports = {
  InMemoryUserStore,
  DuplicateEmailError,
  buildSeedUsersWithHashedPassword,
  normalizeEmail
};
