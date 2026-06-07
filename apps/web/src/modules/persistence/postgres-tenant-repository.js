const { validateTenantInput } = require('../tenants');
const { buildValidationError } = require('../error-utils');

class PostgresTenantRepository {
  constructor({ pool }) {
    this.pool = pool;
  }

  async list() {
    const result = await this.pool.query(
      `SELECT id, slug, name, created_at, updated_at
       FROM tenants
       ORDER BY slug ASC`
    );
    return result.rows;
  }

  async getBySlug(slug) {
    if (typeof slug !== 'string') return null;
    const result = await this.pool.query(
      `SELECT id, slug, name, created_at, updated_at
       FROM tenants
       WHERE slug = $1
       LIMIT 1`,
      [slug]
    );
    return result.rows[0] ?? null;
  }

  async create(input) {
    const payload = validateTenantInput(input);
    try {
      const result = await this.pool.query(
        `INSERT INTO tenants (id, slug, name)
         VALUES ($1, $2, $3)
         RETURNING id, slug, name, created_at, updated_at`,
        [payload.slug, payload.slug, payload.name]
      );
      return result.rows[0];
    } catch (error) {
      if (error?.code === '23505') {
        const err = buildValidationError('A tenant with this slug already exists');
        err.code = 'DUPLICATE_SLUG';
        throw err;
      }
      throw error;
    }
  }
}

module.exports = {
  PostgresTenantRepository
};
