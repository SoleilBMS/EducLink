const crypto = require('node:crypto');

const { buildValidationError } = require('./error-utils');

const ATTENDANCE_STATUSES = ['present', 'absent', 'late'];

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

function requireDateString(value, fieldName) {
  const normalized = requireString(value, fieldName, 10, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw buildValidationError(`${fieldName} must be in YYYY-MM-DD format`);
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw buildValidationError(`${fieldName} must be a valid calendar date`);
  }

  return normalized;
}

function normalizeRecordInput(input) {
  return {
    studentId: requireString(input.studentId, 'studentId', 2, 120),
    status: requireString(input.status, 'status', 4, 20)
  };
}

class AttendanceStore {
  constructor({ records = [], studentStore, teacherStore, classRoomStore }) {
    this.records = [...records];
    this.studentStore = studentStore;
    this.teacherStore = teacherStore;
    this.classRoomStore = classRoomStore;
  }

  list(tenantId, { date, classRoomId } = {}) {
    return this.records.filter((record) => {
      if (record.tenant_id !== tenantId) {
        return false;
      }

      if (date && record.date !== date) {
        return false;
      }

      if (classRoomId && record.classRoomId !== classRoomId) {
        return false;
      }

      return true;
    });
  }

  upsertForClass(tenantId, { teacherId, classRoomId, date, records }) {
    const normalizedDate = requireDateString(date, 'date');
    const normalizedClassRoomId = requireString(classRoomId, 'classRoomId', 2, 120);
    const normalizedTeacherId = requireString(teacherId, 'teacherId', 2, 120);

    const classRoom = this.classRoomStore.get('classRooms', tenantId, normalizedClassRoomId);
    if (!classRoom) {
      throw buildValidationError('classRoomId must reference an existing class room in tenant scope');
    }

    const teacher = this.teacherStore.get(tenantId, normalizedTeacherId, { includeArchived: false });
    if (!teacher || !teacher.classRoomIds.includes(normalizedClassRoomId)) {
      throw buildValidationError('Teacher is not authorized for this class room');
    }

    if (!Array.isArray(records) || records.length === 0) {
      throw buildValidationError('records must be a non-empty array');
    }

    const allowedStudentIds = new Set(
      this.studentStore.list(tenantId, { classRoomId: normalizedClassRoomId }).map((student) => student.id)
    );

    const now = new Date().toISOString();
    const saved = [];
    for (const entry of records) {
      const normalized = normalizeRecordInput(entry);
      if (!ATTENDANCE_STATUSES.includes(normalized.status)) {
        throw buildValidationError('status must be one of: present, absent, late');
      }

      if (!allowedStudentIds.has(normalized.studentId)) {
        throw buildValidationError('studentId must reference an active student in the selected class room and tenant');
      }

      const index = this.records.findIndex(
        (item) =>
          item.tenant_id === tenantId &&
          item.date === normalizedDate &&
          item.classRoomId === normalizedClassRoomId &&
          item.studentId === normalized.studentId
      );

      if (index >= 0) {
        const updated = {
          ...this.records[index],
          status: normalized.status,
          teacherId: normalizedTeacherId,
          updated_at: now
        };
        this.records[index] = updated;
        saved.push(updated);
      } else {
        const created = {
          id: `attendance-${crypto.randomUUID()}`,
          tenant_id: tenantId,
          date: normalizedDate,
          classRoomId: normalizedClassRoomId,
          studentId: normalized.studentId,
          teacherId: normalizedTeacherId,
          status: normalized.status,
          created_at: now,
          updated_at: now
        };
        this.records.push(created);
        saved.push(created);
      }
    }

    return saved;
  }
}

module.exports = {
  AttendanceStore,
  ATTENDANCE_STATUSES,
  buildValidationError,
  requireDateString
};
