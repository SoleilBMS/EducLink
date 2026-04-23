const crypto = require('node:crypto');

const { buildValidationError } = require('./error-utils');

function requireString(value, fieldName, min = 1, max = 120) {
  if (typeof value !== 'string') {
    throw buildValidationError(`${fieldName} is required`);
  }

  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw buildValidationError(`${fieldName} must be between ${min} and ${max} characters`);
  }

  return normalized;
}

function optionalString(value, fieldName, max = 200) {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  if (typeof value !== 'string') {
    throw buildValidationError(`${fieldName} must be a string`);
  }

  const normalized = value.trim();
  if (normalized.length > max) {
    throw buildValidationError(`${fieldName} must be at most ${max} characters`);
  }

  return normalized;
}

function optionalEmail(value) {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  const normalized = requireString(value, 'email', 5, 180).toLowerCase();
  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  if (!isValid) {
    throw buildValidationError('email must be valid');
  }

  return normalized;
}

function normalizeIdList(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return [];
  }

  if (!Array.isArray(value)) {
    throw buildValidationError(`${fieldName} must be an array of ids`);
  }

  const normalized = [...new Set(value.map((item) => requireString(item, fieldName, 2, 120)))];
  return normalized;
}

function validateTeacherInput(input) {
  return {
    firstName: requireString(input.firstName, 'firstName', 1, 80),
    lastName: requireString(input.lastName, 'lastName', 1, 80),
    email: optionalEmail(input.email),
    phone: optionalString(input.phone, 'phone', 40),
    notes: optionalString(input.notes, 'notes', 500),
    classRoomIds: normalizeIdList(input.classRoomIds, 'classRoomIds'),
    subjectIds: normalizeIdList(input.subjectIds, 'subjectIds')
  };
}

class TeacherStore {
  constructor({ teachers = [], classRoomStore }) {
    this.teachers = [...teachers];
    this.classRoomStore = classRoomStore;
  }

  list(tenantId, { includeArchived = false } = {}) {
    return this.teachers.filter((teacher) => {
      if (teacher.tenant_id !== tenantId) {
        return false;
      }

      if (!includeArchived && teacher.archived_at) {
        return false;
      }

      return true;
    });
  }

  get(tenantId, id, { includeArchived = true } = {}) {
    const teacher = this.teachers.find((item) => item.id === id && item.tenant_id === tenantId);
    if (!teacher) {
      return null;
    }

    if (!includeArchived && teacher.archived_at) {
      return null;
    }

    return teacher;
  }

  create(tenantId, input) {
    const payload = validateTeacherInput(input);
    this.ensureAssignmentsInTenant(tenantId, payload);

    const createdAt = new Date().toISOString();
    const teacher = {
      id: `teacher-${crypto.randomUUID()}`,
      tenant_id: tenantId,
      ...payload,
      archived_at: null,
      created_at: createdAt,
      updated_at: createdAt
    };

    this.teachers.push(teacher);
    return teacher;
  }

  update(tenantId, id, input) {
    const index = this.teachers.findIndex((item) => item.id === id && item.tenant_id === tenantId);
    if (index < 0) {
      return null;
    }

    const payload = validateTeacherInput(input);
    this.ensureAssignmentsInTenant(tenantId, payload);

    const updated = {
      ...this.teachers[index],
      ...payload,
      updated_at: new Date().toISOString()
    };

    this.teachers[index] = updated;
    return updated;
  }

  archive(tenantId, id) {
    const index = this.teachers.findIndex((item) => item.id === id && item.tenant_id === tenantId);
    if (index < 0) {
      return null;
    }

    const archivedAt = new Date().toISOString();
    const archived = {
      ...this.teachers[index],
      archived_at: archivedAt,
      updated_at: archivedAt
    };

    this.teachers[index] = archived;
    return archived;
  }

  ensureAssignmentsInTenant(tenantId, payload) {
    for (const classRoomId of payload.classRoomIds) {
      const classRoom = this.classRoomStore.get('classRooms', tenantId, classRoomId);
      if (!classRoom) {
        throw buildValidationError('classRoomIds must reference existing class rooms in tenant scope');
      }
    }

    for (const subjectId of payload.subjectIds) {
      const subject = this.classRoomStore.get('subjects', tenantId, subjectId);
      if (!subject) {
        throw buildValidationError('subjectIds must reference existing subjects in tenant scope');
      }
    }
  }
}

module.exports = {
  TeacherStore,
  buildValidationError
};
