const crypto = require('node:crypto');

const { buildValidationError } = require('../error-utils');

function requireString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw buildValidationError(`${fieldName} is required`);
  }
  return value.trim();
}

function optionalString(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw buildValidationError('Invalid value type');
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

const ENTITY_META = Object.freeze({
  schools: { idPrefix: 'school', validate: validateSchool },
  academicYears: { idPrefix: 'ay', validate: validateAcademicYear },
  terms: { idPrefix: 'term', validate: validateTerm },
  gradeLevels: { idPrefix: 'grade', validate: validateGradeLevel },
  classRooms: { idPrefix: 'class', validate: validateClassRoom },
  subjects: { idPrefix: 'subject', validate: validateSubject }
});

class PostgresCoreSchoolRepository {
  constructor({ pool }) {
    this.pool = pool;
  }

  async list(entity, tenantId) {
    if (entity === 'classRooms') return this.listClassRooms(tenantId);
    if (entity === 'subjects') return this.listSubjects(tenantId);
    if (entity === 'schools') return this.listSchools(tenantId);
    if (entity === 'academicYears') return this.listAcademicYears(tenantId);
    if (entity === 'terms') return this.listTerms(tenantId);
    if (entity === 'gradeLevels') return this.listGradeLevels(tenantId);
    throw buildValidationError(`Unknown entity ${entity}`);
  }

  async get(entity, tenantId, id) {
    if (entity === 'classRooms') return this.getClassRoom(tenantId, id);
    if (entity === 'subjects') return this.getSubject(tenantId, id);
    if (entity === 'schools') return this.getOneById('schools', tenantId, id, schoolSelect());
    if (entity === 'academicYears') return this.getOneById('academic_years', tenantId, id, academicYearSelect());
    if (entity === 'terms') return this.getOneById('terms', tenantId, id, termSelect());
    if (entity === 'gradeLevels') return this.getOneById('grade_levels', tenantId, id, gradeLevelSelect());
    return null;
  }

  async create(entity, tenantId, input) {
    const meta = ENTITY_META[entity];
    if (!meta) throw buildValidationError(`Unknown entity ${entity}`);
    const payload = meta.validate(input);
    await this.enforceReferences(entity, tenantId, payload);
    const id = `${meta.idPrefix}-${crypto.randomUUID()}`;

    if (entity === 'schools') {
      const r = await this.pool.query(
        `INSERT INTO schools (id, tenant_id, name, code, city, country)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ${schoolSelect()}`,
        [id, tenantId, payload.name, payload.code, payload.city, payload.country]
      );
      return r.rows[0];
    }
    if (entity === 'academicYears') {
      const r = await this.pool.query(
        `INSERT INTO academic_years (id, tenant_id, label, starts_at, ends_at, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ${academicYearSelect()}`,
        [id, tenantId, payload.label, payload.startsAt, payload.endsAt, payload.status]
      );
      return r.rows[0];
    }
    if (entity === 'terms') {
      const r = await this.pool.query(
        `INSERT INTO terms (id, tenant_id, academic_year_id, name, starts_at, ends_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ${termSelect()}`,
        [id, tenantId, payload.academicYearId, payload.name, payload.startsAt, payload.endsAt]
      );
      return r.rows[0];
    }
    if (entity === 'gradeLevels') {
      const r = await this.pool.query(
        `INSERT INTO grade_levels (id, tenant_id, name, order_index)
         VALUES ($1, $2, $3, $4)
         RETURNING ${gradeLevelSelect()}`,
        [id, tenantId, payload.name, payload.order]
      );
      return r.rows[0];
    }
    if (entity === 'classRooms') {
      const r = await this.pool.query(
        `INSERT INTO class_rooms (id, tenant_id, name, grade_level_id, capacity)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, tenant_id, name, grade_level_id AS "gradeLevelId", capacity`,
        [id, tenantId, payload.name, payload.gradeLevelId, payload.capacity]
      );
      return r.rows[0];
    }
    if (entity === 'subjects') {
      const r = await this.pool.query(
        `INSERT INTO subjects (id, tenant_id, name, code)
         VALUES ($1, $2, $3, $4)
         RETURNING id, tenant_id, name, code`,
        [id, tenantId, payload.name, payload.code]
      );
      return r.rows[0];
    }
    return null;
  }

  async update(entity, tenantId, id, input) {
    const meta = ENTITY_META[entity];
    if (!meta) throw buildValidationError(`Unknown entity ${entity}`);
    const payload = meta.validate(input);
    await this.enforceReferences(entity, tenantId, payload);

    if (entity === 'schools') {
      const r = await this.pool.query(
        `UPDATE schools SET name=$1, code=$2, city=$3, country=$4, updated_at=NOW()
         WHERE tenant_id=$5 AND id=$6
         RETURNING ${schoolSelect()}`,
        [payload.name, payload.code, payload.city, payload.country, tenantId, id]
      );
      return r.rows[0] ?? null;
    }
    if (entity === 'academicYears') {
      const r = await this.pool.query(
        `UPDATE academic_years SET label=$1, starts_at=$2, ends_at=$3, status=$4, updated_at=NOW()
         WHERE tenant_id=$5 AND id=$6
         RETURNING ${academicYearSelect()}`,
        [payload.label, payload.startsAt, payload.endsAt, payload.status, tenantId, id]
      );
      return r.rows[0] ?? null;
    }
    if (entity === 'terms') {
      const r = await this.pool.query(
        `UPDATE terms SET academic_year_id=$1, name=$2, starts_at=$3, ends_at=$4, updated_at=NOW()
         WHERE tenant_id=$5 AND id=$6
         RETURNING ${termSelect()}`,
        [payload.academicYearId, payload.name, payload.startsAt, payload.endsAt, tenantId, id]
      );
      return r.rows[0] ?? null;
    }
    if (entity === 'gradeLevels') {
      const r = await this.pool.query(
        `UPDATE grade_levels SET name=$1, order_index=$2, updated_at=NOW()
         WHERE tenant_id=$3 AND id=$4
         RETURNING ${gradeLevelSelect()}`,
        [payload.name, payload.order, tenantId, id]
      );
      return r.rows[0] ?? null;
    }
    if (entity === 'classRooms') {
      const r = await this.pool.query(
        `UPDATE class_rooms SET name=$1, grade_level_id=$2, capacity=$3, updated_at=NOW()
         WHERE tenant_id=$4 AND id=$5
         RETURNING id, tenant_id, name, grade_level_id AS "gradeLevelId", capacity`,
        [payload.name, payload.gradeLevelId, payload.capacity, tenantId, id]
      );
      return r.rows[0] ?? null;
    }
    if (entity === 'subjects') {
      const r = await this.pool.query(
        `UPDATE subjects SET name=$1, code=$2, updated_at=NOW()
         WHERE tenant_id=$3 AND id=$4
         RETURNING id, tenant_id, name, code`,
        [payload.name, payload.code, tenantId, id]
      );
      return r.rows[0] ?? null;
    }
    return null;
  }

  async delete(entity, tenantId, id) {
    const table = {
      schools: 'schools',
      academicYears: 'academic_years',
      terms: 'terms',
      gradeLevels: 'grade_levels',
      classRooms: 'class_rooms',
      subjects: 'subjects'
    }[entity];
    if (!table) throw buildValidationError(`Unknown entity ${entity}`);
    const r = await this.pool.query(
      `DELETE FROM ${table} WHERE tenant_id=$1 AND id=$2`,
      [tenantId, id]
    );
    return r.rowCount > 0;
  }

  async enforceReferences(entity, tenantId, payload) {
    if (entity === 'terms') {
      const year = await this.get('academicYears', tenantId, payload.academicYearId);
      if (!year) throw buildValidationError('academicYearId must reference an existing academic year');
    }
    if (entity === 'classRooms') {
      const grade = await this.get('gradeLevels', tenantId, payload.gradeLevelId);
      if (!grade) throw buildValidationError('gradeLevelId must reference an existing grade level');
    }
  }

  async getOneById(table, tenantId, id, select) {
    const r = await this.pool.query(
      `SELECT ${select} FROM ${table} WHERE tenant_id=$1 AND id=$2 LIMIT 1`,
      [tenantId, id]
    );
    return r.rows[0] ?? null;
  }

  async listSchools(tenantId) {
    const r = await this.pool.query(
      `SELECT ${schoolSelect()} FROM schools WHERE tenant_id=$1 ORDER BY name ASC`,
      [tenantId]
    );
    return r.rows;
  }

  async listAcademicYears(tenantId) {
    const r = await this.pool.query(
      `SELECT ${academicYearSelect()} FROM academic_years WHERE tenant_id=$1 ORDER BY starts_at DESC`,
      [tenantId]
    );
    return r.rows;
  }

  async listTerms(tenantId) {
    const r = await this.pool.query(
      `SELECT ${termSelect()} FROM terms WHERE tenant_id=$1 ORDER BY starts_at ASC`,
      [tenantId]
    );
    return r.rows;
  }

  async listGradeLevels(tenantId) {
    const r = await this.pool.query(
      `SELECT ${gradeLevelSelect()} FROM grade_levels WHERE tenant_id=$1 ORDER BY order_index ASC, name ASC`,
      [tenantId]
    );
    return r.rows;
  }

  async listClassRooms(tenantId) {
    const result = await this.pool.query(
      `SELECT id, tenant_id, name, grade_level_id AS "gradeLevelId", capacity
       FROM class_rooms
       WHERE tenant_id = $1
       ORDER BY name ASC`,
      [tenantId]
    );
    return result.rows;
  }

  async getClassRoom(tenantId, classRoomId) {
    const result = await this.pool.query(
      `SELECT id, tenant_id, name, grade_level_id AS "gradeLevelId", capacity
       FROM class_rooms
       WHERE tenant_id = $1 AND id = $2
       LIMIT 1`,
      [tenantId, classRoomId]
    );
    return result.rows[0] ?? null;
  }

  async listSubjects(tenantId) {
    const result = await this.pool.query(
      `SELECT id, tenant_id, name, code
       FROM subjects
       WHERE tenant_id = $1
       ORDER BY name ASC`,
      [tenantId]
    );
    return result.rows;
  }

  async getSubject(tenantId, subjectId) {
    const result = await this.pool.query(
      `SELECT id, tenant_id, name, code
       FROM subjects
       WHERE tenant_id = $1 AND id = $2
       LIMIT 1`,
      [tenantId, subjectId]
    );
    return result.rows[0] ?? null;
  }
}

function schoolSelect() {
  return 'id, tenant_id, name, code, city, country, created_at, updated_at';
}

function academicYearSelect() {
  return 'id, tenant_id, label, starts_at AS "startsAt", ends_at AS "endsAt", status, created_at, updated_at';
}

function termSelect() {
  return 'id, tenant_id, academic_year_id AS "academicYearId", name, starts_at AS "startsAt", ends_at AS "endsAt", created_at, updated_at';
}

function gradeLevelSelect() {
  return 'id, tenant_id, name, order_index AS "order", created_at, updated_at';
}

module.exports = {
  PostgresCoreSchoolRepository
};
