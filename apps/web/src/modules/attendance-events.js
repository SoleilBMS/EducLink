const crypto = require('node:crypto');

const {
  buildValidationError,
  requireDateString,
  requireString
} = require('./attendance');

const ATTENDANCE_EVENT_TYPES = ['infirmary', 'observation', 'encouragement', 'punition'];

const ATTENDANCE_EVENT_TYPE_LABELS_FR = {
  infirmary: 'Passage infirmerie',
  observation: 'Observation',
  encouragement: 'Encouragement',
  punition: 'Punition'
};

const ATTENDANCE_EVENT_TYPE_BADGES = {
  infirmary: 'is-info',
  observation: 'is-neutral',
  encouragement: 'is-success',
  punition: 'is-error'
};

const MAX_COMMENT_LENGTH = 500;

function normalizeOptionalComment(value) {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value !== 'string') {
    throw buildValidationError('comment must be a string');
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    throw buildValidationError(`comment must be at most ${MAX_COMMENT_LENGTH} characters`);
  }
  return trimmed;
}

class AttendanceEventsStore {
  constructor({ events = [], studentStore, classRoomStore }) {
    this.events = [...events];
    this.studentStore = studentStore;
    this.classRoomStore = classRoomStore;
  }

  list(tenantId, { date, classRoomId, studentId } = {}) {
    return this.events
      .filter((event) => {
        if (event.tenant_id !== tenantId) {
          return false;
        }
        if (date && event.date !== date) {
          return false;
        }
        if (classRoomId && event.classRoomId !== classRoomId) {
          return false;
        }
        if (studentId && event.studentId !== studentId) {
          return false;
        }
        return true;
      })
      .sort((a, b) => (b.created_at < a.created_at ? -1 : b.created_at > a.created_at ? 1 : 0));
  }

  get(tenantId, eventId) {
    return this.events.find(
      (event) => event.tenant_id === tenantId && event.id === eventId
    ) || null;
  }

  create(tenantId, {
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

    const classRoom = this.classRoomStore.get('classRooms', tenantId, normalizedClassRoomId);
    if (!classRoom) {
      throw buildValidationError('classRoomId must reference an existing class room in tenant scope');
    }

    const studentsInClass = this.studentStore.list(tenantId, { classRoomId: normalizedClassRoomId });
    if (!studentsInClass.some((student) => student.id === normalizedStudentId)) {
      throw buildValidationError('studentId must reference an active student in the selected class room and tenant');
    }

    const now = new Date().toISOString();
    const created = {
      id: `attendance-event-${crypto.randomUUID()}`,
      tenant_id: tenantId,
      date: normalizedDate,
      classRoomId: normalizedClassRoomId,
      studentId: normalizedStudentId,
      recordedByUserId: normalizedUserId,
      recordedByRole: normalizedRole,
      eventType: normalizedType,
      comment: normalizedComment,
      created_at: now,
      updated_at: now
    };
    this.events.push(created);
    return created;
  }

  delete(tenantId, eventId, { actorUserId, actorRole } = {}) {
    const index = this.events.findIndex(
      (event) => event.tenant_id === tenantId && event.id === eventId
    );
    if (index < 0) {
      return null;
    }

    const event = this.events[index];
    const isOwner = actorUserId && event.recordedByUserId === actorUserId;
    const isAdmin = actorRole === 'school_admin' || actorRole === 'director';
    if (!isOwner && !isAdmin) {
      throw buildValidationError('Only the recording user or a school admin can delete this event');
    }

    this.events.splice(index, 1);
    return event;
  }
}

module.exports = {
  AttendanceEventsStore,
  ATTENDANCE_EVENT_TYPES,
  ATTENDANCE_EVENT_TYPE_LABELS_FR,
  ATTENDANCE_EVENT_TYPE_BADGES,
  MAX_COMMENT_LENGTH,
  normalizeOptionalComment
};
