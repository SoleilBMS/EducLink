const crypto = require('node:crypto');

const { buildValidationError } = require('./error-utils');

const ENTITY = Object.freeze({
  SCHOOL: 'schools',
  ACADEMIC_YEAR: 'academicYears',
  TERM: 'terms',
  GRADE_LEVEL: 'gradeLevels',
  CLASS_ROOM: 'classRooms',
  SUBJECT: 'subjects'
});

const entityConfig = Object.freeze({
  [ENTITY.SCHOOL]: {
    idPrefix: 'school',
    validate: validateSchool
  },
  [ENTITY.ACADEMIC_YEAR]: {
    idPrefix: 'ay',
    validate: validateAcademicYear
  },
  [ENTITY.TERM]: {
    idPrefix: 'term',
    validate: validateTerm
  },
  [ENTITY.GRADE_LEVEL]: {
    idPrefix: 'grade',
    validate: validateGradeLevel
  },
  [ENTITY.CLASS_ROOM]: {
    idPrefix: 'class',
    validate: validateClassRoom
  },
  [ENTITY.SUBJECT]: {
    idPrefix: 'subject',
    validate: validateSubject
  }
});

function requireString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw buildValidationError(`${fieldName} is required`);
  }

  return value.trim();
}

function optionalString(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw buildValidationError('Invalid value type');
  }

  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

function requireDate(value, fieldName) {
  const normalized = requireString(value, fieldName);
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    throw buildValidationError(`${fieldName} must be a valid date`);
  }

  return normalized;
}

function validateSchool(input) {
  return {
    name: requireString(input.name, 'name'),
    code: requireString(input.code, 'code'),
    city: optionalString(input.city) ?? '',
    country: optionalString(input.country) ?? ''
  };
}

function validateAcademicYear(input) {
  const startsAt = requireDate(input.startsAt, 'startsAt');
  const endsAt = requireDate(input.endsAt, 'endsAt');

  if (new Date(startsAt).getTime() >= new Date(endsAt).getTime()) {
    throw buildValidationError('startsAt must be before endsAt');
  }

  return {
    label: requireString(input.label, 'label'),
    startsAt,
    endsAt,
    status: optionalString(input.status) ?? 'draft'
  };
}

function validateTerm(input) {
  const startsAt = requireDate(input.startsAt, 'startsAt');
  const endsAt = requireDate(input.endsAt, 'endsAt');

  if (new Date(startsAt).getTime() >= new Date(endsAt).getTime()) {
    throw buildValidationError('startsAt must be before endsAt');
  }

  return {
    name: requireString(input.name, 'name'),
    academicYearId: requireString(input.academicYearId, 'academicYearId'),
    startsAt,
    endsAt
  };
}

function validateGradeLevel(input) {
  return {
    name: requireString(input.name, 'name'),
    order: Number.isFinite(Number(input.order)) ? Number(input.order) : 0
  };
}

function validateClassRoom(input) {
  return {
    name: requireString(input.name, 'name'),
    gradeLevelId: requireString(input.gradeLevelId, 'gradeLevelId'),
    capacity: Number.isFinite(Number(input.capacity)) ? Number(input.capacity) : 0
  };
}

function validateSubject(input) {
  return {
    name: requireString(input.name, 'name'),
    code: requireString(input.code, 'code')
  };
}

class CoreSchoolStore {
  constructor(seed = {}) {
    this.data = {
      [ENTITY.SCHOOL]: seed.schools ? [...seed.schools] : [],
      [ENTITY.ACADEMIC_YEAR]: seed.academicYears ? [...seed.academicYears] : [],
      [ENTITY.TERM]: seed.terms ? [...seed.terms] : [],
      [ENTITY.GRADE_LEVEL]: seed.gradeLevels ? [...seed.gradeLevels] : [],
      [ENTITY.CLASS_ROOM]: seed.classRooms ? [...seed.classRooms] : [],
      [ENTITY.SUBJECT]: seed.subjects ? [...seed.subjects] : []
    };
  }

  list(entity, tenantId) {
    return this.data[entity].filter((item) => item.tenant_id === tenantId);
  }

  get(entity, tenantId, id) {
    return this.data[entity].find((item) => item.id === id && item.tenant_id === tenantId) ?? null;
  }

  create(entity, tenantId, input) {
    const payload = entityConfig[entity].validate(input);
    this.enforceReferences(entity, tenantId, payload);
    const item = {
      id: `${entityConfig[entity].idPrefix}-${crypto.randomUUID()}`,
      tenant_id: tenantId,
      ...payload
    };

    this.data[entity].push(item);
    return item;
  }

  update(entity, tenantId, id, input) {
    const index = this.data[entity].findIndex((item) => item.id === id && item.tenant_id === tenantId);
    if (index === -1) {
      return null;
    }

    const payload = entityConfig[entity].validate(input);
    this.enforceReferences(entity, tenantId, payload);

    const updated = {
      ...this.data[entity][index],
      ...payload
    };

    this.data[entity][index] = updated;
    return updated;
  }

  delete(entity, tenantId, id) {
    const index = this.data[entity].findIndex((item) => item.id === id && item.tenant_id === tenantId);
    if (index === -1) {
      return false;
    }

    this.data[entity].splice(index, 1);
    return true;
  }

  enforceReferences(entity, tenantId, payload) {
    if (entity === ENTITY.TERM) {
      const year = this.get(ENTITY.ACADEMIC_YEAR, tenantId, payload.academicYearId);
      if (!year) {
        throw buildValidationError('academicYearId must reference an existing academic year');
      }
    }

    if (entity === ENTITY.CLASS_ROOM) {
      const grade = this.get(ENTITY.GRADE_LEVEL, tenantId, payload.gradeLevelId);
      if (!grade) {
        throw buildValidationError('gradeLevelId must reference an existing grade level');
      }
    }
  }
}

module.exports = {
  ENTITY,
  CoreSchoolStore,
  buildValidationError
};
