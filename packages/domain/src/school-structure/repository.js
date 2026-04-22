const crypto = require('node:crypto');

function nowIso() {
  return new Date().toISOString();
}

class SchoolStructureRepository {
  constructor(seed = {}) {
    this.data = {
      school: seed.school ?? [],
      academic_year: seed.academic_year ?? [],
      term: seed.term ?? [],
      grade_level: seed.grade_level ?? [],
      class_room: seed.class_room ?? [],
      subject: seed.subject ?? []
    };
  }

  list(entityType, tenantId) {
    return this.data[entityType].filter((item) => item.tenant_id === tenantId);
  }

  findById(entityType, id) {
    return this.data[entityType].find((item) => item.id === id) ?? null;
  }

  create(entityType, tenantId, payload) {
    const createdAt = nowIso();
    const item = {
      id: payload.id ?? crypto.randomUUID(),
      tenant_id: tenantId,
      ...payload,
      created_at: createdAt,
      updated_at: createdAt
    };

    this.data[entityType].push(item);
    return item;
  }

  update(entityType, id, payload) {
    const index = this.data[entityType].findIndex((item) => item.id === id);
    if (index === -1) {
      return null;
    }

    const updated = {
      ...this.data[entityType][index],
      ...payload,
      id,
      tenant_id: this.data[entityType][index].tenant_id,
      updated_at: nowIso()
    };

    this.data[entityType][index] = updated;
    return updated;
  }

  delete(entityType, id) {
    const before = this.data[entityType].length;
    this.data[entityType] = this.data[entityType].filter((item) => item.id !== id);
    return this.data[entityType].length < before;
  }
}

module.exports = {
  SchoolStructureRepository
};
