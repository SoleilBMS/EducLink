const crypto = require('node:crypto');

const { buildValidationError } = require('../student');

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

function mapStudent(row) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    firstName: row.firstName,
    lastName: row.lastName,
    admissionNumber: row.admissionNumber,
    classRoomId: row.classRoomId,
    dateOfBirth: row.dateOfBirth,
    archived_at: row.archived_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

class PostgresStudentRepository {
  constructor({ pool, classRoomRepository }) {
    this.pool = pool;
    this.classRoomRepository = classRoomRepository;
  }

  async list(tenantId, { classRoomId, includeArchived = false } = {}) {
    const clauses = ['tenant_id = $1'];
    const params = [tenantId];

    if (!includeArchived) {
      clauses.push('archived_at IS NULL');
    }

    if (classRoomId) {
      params.push(classRoomId);
      clauses.push(`class_room_id = $${params.length}`);
    }

    const result = await this.pool.query(
      `SELECT id, tenant_id, first_name AS "firstName", last_name AS "lastName",
              admission_number AS "admissionNumber", class_room_id AS "classRoomId",
              date_of_birth AS "dateOfBirth", archived_at, created_at, updated_at
       FROM students
       WHERE ${clauses.join(' AND ')}
       ORDER BY created_at DESC`,
      params
    );

    return result.rows.map(mapStudent);
  }

  async get(tenantId, id, { includeArchived = true } = {}) {
    const params = [tenantId, id];
    const archivedClause = includeArchived ? '' : 'AND archived_at IS NULL';

    const result = await this.pool.query(
      `SELECT id, tenant_id, first_name AS "firstName", last_name AS "lastName",
              admission_number AS "admissionNumber", class_room_id AS "classRoomId",
              date_of_birth AS "dateOfBirth", archived_at, created_at, updated_at
       FROM students
       WHERE tenant_id = $1 AND id = $2 ${archivedClause}
       LIMIT 1`,
      params
    );

    return result.rows[0] ? mapStudent(result.rows[0]) : null;
  }

  async create(tenantId, input) {
    const payload = validateStudentInput(input);
    await this.ensureClassRoomInTenant(tenantId, payload.classRoomId);

    const id = `student-${crypto.randomUUID()}`;
    const result = await this.pool.query(
      `INSERT INTO students (id, tenant_id, first_name, last_name, admission_number, class_room_id, date_of_birth)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, tenant_id, first_name AS "firstName", last_name AS "lastName",
                 admission_number AS "admissionNumber", class_room_id AS "classRoomId",
                 date_of_birth AS "dateOfBirth", archived_at, created_at, updated_at`,
      [id, tenantId, payload.firstName, payload.lastName, payload.admissionNumber, payload.classRoomId, payload.dateOfBirth]
    );

    return mapStudent(result.rows[0]);
  }

  async update(tenantId, id, input) {
    const existing = await this.get(tenantId, id);
    if (!existing) {
      return null;
    }

    const payload = validateStudentInput(input);
    await this.ensureClassRoomInTenant(tenantId, payload.classRoomId);

    const result = await this.pool.query(
      `UPDATE students
       SET first_name = $1,
           last_name = $2,
           admission_number = $3,
           class_room_id = $4,
           date_of_birth = $5,
           updated_at = NOW()
       WHERE tenant_id = $6 AND id = $7
       RETURNING id, tenant_id, first_name AS "firstName", last_name AS "lastName",
                 admission_number AS "admissionNumber", class_room_id AS "classRoomId",
                 date_of_birth AS "dateOfBirth", archived_at, created_at, updated_at`,
      [payload.firstName, payload.lastName, payload.admissionNumber, payload.classRoomId, payload.dateOfBirth, tenantId, id]
    );

    return mapStudent(result.rows[0]);
  }

  async archive(tenantId, id) {
    const result = await this.pool.query(
      `UPDATE students
       SET archived_at = NOW(),
           updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING id, tenant_id, first_name AS "firstName", last_name AS "lastName",
                 admission_number AS "admissionNumber", class_room_id AS "classRoomId",
                 date_of_birth AS "dateOfBirth", archived_at, created_at, updated_at`,
      [tenantId, id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapStudent(result.rows[0]);
  }

  async ensureClassRoomInTenant(tenantId, classRoomId) {
    const classRoom = await this.classRoomRepository.getClassRoom(tenantId, classRoomId);
    if (!classRoom) {
      throw buildValidationError('classRoomId must reference an existing class room in tenant scope');
    }
  }
}

module.exports = {
  PostgresStudentRepository
};
