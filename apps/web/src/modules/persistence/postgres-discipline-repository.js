const crypto = require('node:crypto');

const {
  buildValidationError,
  requireDateString,
  requireString
} = require('../attendance');
const {
  DISCIPLINE_MEASURE_TYPES,
  MEASURES_REQUIRING_SCHEDULE,
  normalizeDescription,
  normalizeDurationMinutes
} = require('../discipline');

const SELECT_COLUMNS = `
  id,
  tenant_id,
  student_id AS "studentId",
  recorded_by_user_id AS "recordedByUserId",
  recorded_by_role AS "recordedByRole",
  measure_type AS "measureType",
  occurred_on AS "occurredOn",
  scheduled_for AS "scheduledFor",
  duration_minutes AS "durationMinutes",
  description,
  created_at,
  updated_at
`;

function mapRow(row) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    studentId: row.studentId,
    recordedByUserId: row.recordedByUserId,
    recordedByRole: row.recordedByRole,
    measureType: row.measureType,
    occurredOn: row.occurredOn,
    scheduledFor: row.scheduledFor ?? null,
    durationMinutes: row.durationMinutes ?? null,
    description: row.description,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

class PostgresDisciplineRepository {
  constructor({ pool, studentStore, parentStore }) {
    this.pool = pool;
    this.studentStore = studentStore;
    this.parentStore = parentStore;
  }

  async list(tenantId, { studentId, classRoomId, measureType, from, to } = {}) {
    const clauses = ['tenant_id = $1'];
    const params = [tenantId];
    if (studentId) {
      params.push(studentId);
      clauses.push(`student_id = $${params.length}`);
    }
    if (measureType) {
      params.push(measureType);
      clauses.push(`measure_type = $${params.length}`);
    }
    if (from) {
      params.push(from);
      clauses.push(`occurred_on >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      clauses.push(`occurred_on <= $${params.length}`);
    }
    if (classRoomId) {
      const studentsInClass = await this.studentStore.list(tenantId, { classRoomId, includeArchived: true });
      const ids = studentsInClass.map((s) => s.id);
      if (ids.length === 0) {
        return [];
      }
      params.push(ids);
      clauses.push(`student_id = ANY($${params.length}::text[])`);
    }
    const result = await this.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM discipline_records WHERE ${clauses.join(' AND ')} ORDER BY occurred_on DESC, created_at DESC`,
      params
    );
    return result.rows.map(mapRow);
  }

  async listForStudent(tenantId, studentId) {
    return this.list(tenantId, { studentId });
  }

  async listForParent(tenantId, parentId) {
    if (!this.parentStore) return [];
    const links = await this.parentStore.listLinksByParent(tenantId, parentId);
    const studentIds = links.map((l) => l.studentId);
    if (studentIds.length === 0) return [];
    const result = await this.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM discipline_records
       WHERE tenant_id = $1 AND student_id = ANY($2::text[])
       ORDER BY occurred_on DESC, created_at DESC`,
      [tenantId, studentIds]
    );
    return result.rows.map(mapRow);
  }

  async get(tenantId, recordId) {
    const result = await this.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM discipline_records WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, recordId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async create(tenantId, {
    studentId,
    recordedByUserId,
    recordedByRole,
    measureType,
    occurredOn,
    scheduledFor,
    durationMinutes,
    description
  }) {
    const normalizedStudentId = requireString(studentId, 'studentId', 2, 120);
    const normalizedRecorderId = requireString(recordedByUserId, 'recordedByUserId', 2, 120);
    const normalizedRecorderRole = requireString(recordedByRole, 'recordedByRole', 2, 60);
    const normalizedType = requireString(measureType, 'measureType', 2, 40);
    if (!DISCIPLINE_MEASURE_TYPES.includes(normalizedType)) {
      throw buildValidationError(`measureType must be one of: ${DISCIPLINE_MEASURE_TYPES.join(', ')}`);
    }
    const normalizedOccurredOn = requireDateString(occurredOn, 'occurredOn');

    const requiresSchedule = MEASURES_REQUIRING_SCHEDULE.has(normalizedType);
    let normalizedScheduledFor = null;
    if (requiresSchedule) {
      normalizedScheduledFor = requireDateString(scheduledFor, 'scheduledFor');
    } else if (scheduledFor !== undefined && scheduledFor !== null && scheduledFor !== '') {
      throw buildValidationError('scheduledFor must not be provided for an observation');
    }
    const normalizedDuration = normalizeDurationMinutes(durationMinutes, normalizedType);
    const normalizedDescription = normalizeDescription(description);

    const student = await this.studentStore.get(tenantId, normalizedStudentId, { includeArchived: false });
    if (!student) {
      throw buildValidationError('studentId must reference an active student in tenant scope');
    }

    const id = `discipline-${crypto.randomUUID()}`;
    const result = await this.pool.query(
      `INSERT INTO discipline_records
         (id, tenant_id, student_id, recorded_by_user_id, recorded_by_role,
          measure_type, occurred_on, scheduled_for, duration_minutes, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${SELECT_COLUMNS}`,
      [
        id,
        tenantId,
        normalizedStudentId,
        normalizedRecorderId,
        normalizedRecorderRole,
        normalizedType,
        normalizedOccurredOn,
        normalizedScheduledFor,
        normalizedDuration,
        normalizedDescription
      ]
    );
    return mapRow(result.rows[0]);
  }

  async delete(tenantId, recordId, { actorUserId, actorRole } = {}) {
    const existing = await this.get(tenantId, recordId);
    if (!existing) {
      return null;
    }
    const isOwner = actorUserId && existing.recordedByUserId === actorUserId;
    const isAdmin = actorRole === 'school_admin' || actorRole === 'director';
    if (!isOwner && !isAdmin) {
      throw buildValidationError('Only the recording user or a school admin can delete this discipline record');
    }
    await this.pool.query(
      `DELETE FROM discipline_records WHERE tenant_id = $1 AND id = $2`,
      [tenantId, recordId]
    );
    return existing;
  }
}

module.exports = { PostgresDisciplineRepository };
