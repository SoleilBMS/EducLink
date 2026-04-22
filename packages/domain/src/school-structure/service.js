const { validatePayload } = require('./validation');

const ENTITY_TYPES = Object.freeze([
  'school',
  'academic_year',
  'term',
  'grade_level',
  'class_room',
  'subject'
]);

class SchoolStructureService {
  constructor(repository) {
    this.repository = repository;
  }

  list(entityType, tenantId) {
    return this.repository.list(entityType, tenantId);
  }

  create(entityType, tenantId, payload) {
    const errors = validatePayload(entityType, payload);
    if (errors.length > 0) {
      return { ok: false, code: 'VALIDATION_ERROR', errors };
    }

    return { ok: true, data: this.repository.create(entityType, tenantId, payload) };
  }

  update(entityType, tenantId, id, payload) {
    const current = this.repository.findById(entityType, id);
    if (!current || current.tenant_id !== tenantId) {
      return { ok: false, code: 'NOT_FOUND', errors: ['Resource not found'] };
    }

    const merged = { ...current, ...payload };
    const errors = validatePayload(entityType, merged);
    if (errors.length > 0) {
      return { ok: false, code: 'VALIDATION_ERROR', errors };
    }

    return { ok: true, data: this.repository.update(entityType, id, payload) };
  }

  delete(entityType, tenantId, id) {
    const current = this.repository.findById(entityType, id);
    if (!current || current.tenant_id !== tenantId) {
      return { ok: false, code: 'NOT_FOUND' };
    }

    this.repository.delete(entityType, id);
    return { ok: true };
  }
}

module.exports = {
  ENTITY_TYPES,
  SchoolStructureService
};
