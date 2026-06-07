const { DuplicateEmailError } = require('../../../../../packages/auth/src/users/user-store');

function mapUser(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

class PostgresUserRepository {
  constructor({ pool }) {
    this.pool = pool;
  }

  async findByEmail(email) {
    if (typeof email !== 'string' || email.trim().length === 0) {
      return null;
    }
    const result = await this.pool.query(
      `SELECT id, tenant_id, email, password_hash, role, is_active, created_at, updated_at
         FROM users
        WHERE LOWER(email) = LOWER($1)
          AND is_active = TRUE
        LIMIT 1`,
      [email.trim()]
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async getById(id) {
    if (typeof id !== 'string') {
      return null;
    }
    const result = await this.pool.query(
      `SELECT id, tenant_id, email, password_hash, role, is_active, created_at, updated_at
         FROM users
        WHERE id = $1
        LIMIT 1`,
      [id]
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async create({ id, tenantId = null, email, role, passwordHash, isActive = true }) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('PostgresUserRepository.create requires a string id');
    }
    if (typeof email !== 'string' || email.trim().length === 0) {
      throw new Error('PostgresUserRepository.create requires an email');
    }
    if (typeof role !== 'string' || role.length === 0) {
      throw new Error('PostgresUserRepository.create requires a role');
    }
    if (typeof passwordHash !== 'string' || passwordHash.length === 0) {
      throw new Error('PostgresUserRepository.create requires a passwordHash');
    }
    const normalizedEmail = email.trim();
    try {
      const result = await this.pool.query(
        `INSERT INTO users (id, tenant_id, email, password_hash, role, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, tenant_id, email, password_hash, role, is_active, created_at, updated_at`,
        [id, tenantId, normalizedEmail, passwordHash, role, isActive]
      );
      return mapUser(result.rows[0]);
    } catch (error) {
      if (error && error.code === '23505') {
        throw new DuplicateEmailError(normalizedEmail);
      }
      throw error;
    }
  }

  async update(id, patch = {}) {
    if (typeof id !== 'string' || id.length === 0) {
      return null;
    }
    if (patch.passwordHash === undefined && patch.isActive === undefined) {
      return this.getById(id);
    }
    const newPasswordHash = patch.passwordHash ?? null;
    const newIsActive = patch.isActive === undefined ? null : Boolean(patch.isActive);
    const result = await this.pool.query(
      `UPDATE users
          SET password_hash = COALESCE($2, password_hash),
              is_active     = COALESCE($3, is_active),
              updated_at    = NOW()
        WHERE id = $1
       RETURNING id, tenant_id, email, password_hash, role, is_active, created_at, updated_at`,
      [id, newPasswordHash, newIsActive]
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async listByTenant(tenantId) {
    const result = await this.pool.query(
      `SELECT id, tenant_id, email, password_hash, role, is_active, created_at, updated_at
         FROM users
        WHERE tenant_id IS NOT DISTINCT FROM $1
        ORDER BY role, LOWER(email)`,
      [tenantId ?? null]
    );
    return result.rows.map(mapUser);
  }
}

module.exports = { PostgresUserRepository };
