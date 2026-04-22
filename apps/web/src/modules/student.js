const crypto = require('node:crypto');

function buildValidationError(message) {
  const error = new Error(message);
  error.code = 'VALIDATION_ERROR';
  error.status = 422;
  return error;
}

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

function optionalString(value, fieldName, max = 120) {
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

function validateStudentInput(input) {
  return {
    firstName: requireString(input.firstName, 'firstName', 1, 80),
    lastName: requireString(input.lastName, 'lastName', 1, 80),
    admissionNumber: requireString(input.admissionNumber, 'admissionNumber', 2, 40),
    classRoomId: requireString(input.classRoomId, 'classRoomId', 2, 80),
    dateOfBirth: optionalString(input.dateOfBirth, 'dateOfBirth', 20)
  };
}

class StudentStore {
  constructor({ students = [], classRoomStore }) {
    this.students = [...students];
    this.classRoomStore = classRoomStore;
  }

  list(tenantId, { classRoomId, includeArchived = false } = {}) {
    return this.students.filter((student) => {
      if (student.tenant_id !== tenantId) {
        return false;
      }

      if (!includeArchived && student.archived_at) {
        return false;
      }

      if (classRoomId && student.classRoomId !== classRoomId) {
        return false;
      }

      return true;
    });
  }

  get(tenantId, id, { includeArchived = true } = {}) {
    const student = this.students.find((item) => item.id === id && item.tenant_id === tenantId);
    if (!student) {
      return null;
    }

    if (!includeArchived && student.archived_at) {
      return null;
    }

    return student;
  }

  create(tenantId, input) {
    const payload = validateStudentInput(input);
    this.ensureClassRoomInTenant(tenantId, payload.classRoomId);

    const createdAt = new Date().toISOString();
    const student = {
      id: `student-${crypto.randomUUID()}`,
      tenant_id: tenantId,
      ...payload,
      archived_at: null,
      created_at: createdAt,
      updated_at: createdAt
    };

    this.students.push(student);
    return student;
  }

  update(tenantId, id, input) {
    const index = this.students.findIndex((item) => item.id === id && item.tenant_id === tenantId);
    if (index < 0) {
      return null;
    }

    const payload = validateStudentInput(input);
    this.ensureClassRoomInTenant(tenantId, payload.classRoomId);

    const updated = {
      ...this.students[index],
      ...payload,
      updated_at: new Date().toISOString()
    };

    this.students[index] = updated;
    return updated;
  }

  archive(tenantId, id) {
    const index = this.students.findIndex((item) => item.id === id && item.tenant_id === tenantId);
    if (index < 0) {
      return null;
    }

    const archived = {
      ...this.students[index],
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.students[index] = archived;
    return archived;
  }

  ensureClassRoomInTenant(tenantId, classRoomId) {
    const classRoom = this.classRoomStore.get('classRooms', tenantId, classRoomId);
    if (!classRoom) {
      throw buildValidationError('classRoomId must reference an existing class room in tenant scope');
    }
  }
}

module.exports = {
  StudentStore,
  buildValidationError
};
