const crypto = require('node:crypto');
const {
  buildValidationError,
  requireDateString,
  requireString
} = require('../attendance');
const {
  ATTENDANCE_EVENT_TYPES,
  normalizeOptionalComment
} = require('../attendance-events');

function mapRow(row) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    date: row.date,
    classRoomId: row.classRoomId,
    studentId: row.studentId,
    recordedByUserId: row.recordedByUserId,
    recordedByRole: row.recordedByRole,
    eventType: row.eventType,
    comment: row.comment,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

const SELECT_COLUMNS = `
  id,
  tenant_id,
  date,
  class_room_id AS "classRoomId",
  student_id AS "studentId",
  recorded_by_user_id AS "recordedByUserId",
  recorded_by_role AS "recordedByRole",
  event_type AS "eventType",
  comment,
  created_at,
  updated_at
`;

class PostgresAttendanceEventsRepository {
  constructor({ pool, studentStore, classRoomStore }) {
    this.pool = pool;
    this.studentStore = studentStore;
    this.classRoomStore = classRoomStore;
  }

  async list(tenantId, { date, classRoomId, studentId } = {}) {
    const clauses = ['tenant_id = $1'];
    const params = [tenantId];
    if (date) {
      params.push(date);
      clauses.push(`date = $${params.length}`);
    }
    if (classRoomId) {
      params.push(classRoomId);
      clauses.push(`class_room_id = $${params.length}`);
    }
    if (studentId) {
      params.push(studentId);
      clauses.push(`student_id = $${params.length}`);
    }
    const result = await this.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM attendance_events WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`,
      params
    );
    return result.rows.map(mapRow);
  }

  async get(tenantId, eventId) {
    const result = await this.pool.query(
      `SELECT ${SELECT_COLUMNS} FROM attendance_events WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, eventId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async create(tenantId, {
    date,
    classRoomId,
    studentId,
    recordedByUserId,
    recordedByRole,
    eventType,
    comment
  }) {
    const normalizedDate = requireDateString(date, 'date');
    const normalizedClassRoomId = requireString(classRoomId, 'classRoomId', 2, 120);
    const normalizedStudentId = requireString(studentId, 'studentId', 2, 120);
    const normalizedUserId = requireString(recordedByUserId, 'recordedByUserId', 2, 120);
    const normalizedRole = requireString(recordedByRole, 'recordedByRole', 2, 60);
    const normalizedType = requireString(eventType, 'eventType', 2, 40);
    const normalizedComment = normalizeOptionalComment(comment);

    if (!ATTENDANCE_EVENT_TYPES.includes(normalizedType)) {
      throw buildValidationError(
        `eventType must be one of: ${ATTENDANCE_EVENT_TYPES.join(', ')}`
      );
    }

    const classRoom = await this.classRoomStore.getClassRoom(tenantId, normalizedClassRoomId);
    if (!classRoom) {
      throw buildValidationError('classRoomId must reference an existing class room in tenant scope');
    }

    const studentsInClass = await this.studentStore.list(tenantId, { classRoomId: normalizedClassRoomId });
    if (!studentsInClass.some((student) => student.id === normalizedStudentId)) {
      throw buildValidationError('studentId must reference an active student in the selected class room and tenant');
    }

    const id = `attendance-event-${crypto.randomUUID()}`;
    const result = await this.pool.query(
      `INSERT INTO attendance_events
        (id, tenant_id, date, class_room_id, student_id, recorded_by_user_id, recorded_by_role, event_type, comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${SELECT_COLUMNS}`,
      [id, tenantId, normalizedDate, normalizedClassRoomId, normalizedStudentId, normalizedUserId, normalizedRole, normalizedType, normalizedComment]
    );
    return mapRow(result.rows[0]);
  }

  async delete(tenantId, eventId, { actorUserId, actorRole } = {}) {
    const existing = await this.get(tenantId, eventId);
    if (!existing) {
      return null;
    }
    const isOwner = actorUserId && existing.recordedByUserId === actorUserId;
    const isAdmin = actorRole === 'school_admin' || actorRole === 'director';
    if (!isOwner && !isAdmin) {
      throw buildValidationError('Only the recording user or a school admin can delete this event');
    }
    await this.pool.query(
      `DELETE FROM attendance_events WHERE tenant_id = $1 AND id = $2`,
      [tenantId, eventId]
    );
    return existing;
  }
}

module.exports = { PostgresAttendanceEventsRepository };
