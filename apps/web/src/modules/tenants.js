const { buildValidationError } = require('./error-utils');

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validateTenantInput(input) {
  if (!input || typeof input !== 'object') {
    throw buildValidationError('Invalid tenant payload');
  }

  const slugRaw = typeof input.slug === 'string' ? input.slug.trim().toLowerCase() : '';
  const nameRaw = typeof input.name === 'string' ? input.name.trim() : '';

  if (!slugRaw || slugRaw.length < 3 || slugRaw.length > 60) {
    throw buildValidationError('slug must be between 3 and 60 characters');
  }
  if (!SLUG_PATTERN.test(slugRaw)) {
    throw buildValidationError('slug must contain only lowercase letters, digits and dashes');
  }
  if (slugRaw === 'platform' || slugRaw === 'admin') {
    throw buildValidationError('slug is reserved');
  }

  if (!nameRaw || nameRaw.length < 2 || nameRaw.length > 120) {
    throw buildValidationError('name must be between 2 and 120 characters');
  }

  return { slug: slugRaw, name: nameRaw };
}

class InMemoryTenantStore {
  constructor(seed = []) {
    this.tenants = seed.map((tenant) => ({ ...tenant }));
  }

  async list() {
    return [...this.tenants].sort((a, b) => a.slug.localeCompare(b.slug));
  }

  async getBySlug(slug) {
    if (typeof slug !== 'string') return null;
    return this.tenants.find((tenant) => tenant.slug === slug) ?? null;
  }

  async create(input) {
    const payload = validateTenantInput(input);
    if (await this.getBySlug(payload.slug)) {
      const err = buildValidationError('A tenant with this slug already exists');
      err.code = 'DUPLICATE_SLUG';
      throw err;
    }

    const now = new Date().toISOString();
    const tenant = {
      id: payload.slug,
      slug: payload.slug,
      name: payload.name,
      created_at: now,
      updated_at: now
    };
    this.tenants.push(tenant);
    return { ...tenant };
  }
}

module.exports = {
  InMemoryTenantStore,
  validateTenantInput
};
