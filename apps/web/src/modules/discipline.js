const crypto = require('node:crypto');

const {
  buildValidationError,
  requireDateString,
  requireString
} = require('./attendance');

const DISCIPLINE_MEASURE_TYPES = ['observation', 'detention', 'exclusion', 'parent_meeting'];

const DISCIPLINE_MEASURE_LABELS_FR = {
  observation: 'Observation',
  detention: 'Retenue',
  exclusion: 'Exclusion de cours',
  parent_meeting: 'Convocation parents'
};

const DISCIPLINE_MEASURE_BADGES = {
  observation: 'is-neutral',
  detention: 'is-warning',
  exclusion: 'is-error',
  parent_meeting: 'is-info'
};

const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_DURATION_MINUTES = 7 * 24 * 60;

const MEASURES_REQUIRING_SCHEDULE = new Set(['detention', 'exclusion', 'parent_meeting']);
const MEASURES_REQUIRING_DURATION = new Set(['detention', 'exclusion']);

function normalizeDescription(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    throw buildValidationError('description is required');
  }
  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    throw buildValidationError(`description must be at most ${MAX_DESCRIPTION_LENGTH} characters`);
  }
  return trimmed;
}

function normalizeDurationMinutes(value, measureType) {
  if (value === undefined || value === null || value === '') {
    if (MEASURES_REQUIRING_DURATION.has(measureType)) {
      throw buildValidationError(`durationMinutes is required for ${measureType}`);
    }
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw buildValidationError('durationMinutes must be a positive integer');
  }
  if (parsed > MAX_DURATION_MINUTES) {
    throw buildValidationError(`durationMinutes must be at most ${MAX_DURATION_MINUTES} (1 week)`);
  }
  return parsed;
}

function shapeRecord(record) {
  return {
    id: record.id,
    tenant_id: record.tenant_id,
    studentId: record.studentId,
    recordedByUserId: record.recordedByUserId,
    recordedByRole: record.recordedByRole,
    measureType: record.measureType,
    occurredOn: record.occurredOn,
    scheduledFor: record.scheduledFor ?? null,
    durationMinutes: record.durationMinutes ?? null,
    description: record.description,
    created_at: record.created_at,
    updated_at: record.updated_at
  };
}

class DisciplineStore {
  constructor({ records = [], studentStore, parentStore }) {
    this.records = records.map((r) => ({ ...r }));
    this.studentStore = studentStore;
    this.parentStore = parentStore;
  }

  list(tenantId, { studentId, classRoomId, measureType, from, to } = {}) {
    const classRoomFilter = classRoomId
      ? new Set(
          this.studentStore.list(tenantId, { classRoomId, includeArchived: true }).map((s) => s.id)
        )
      : null;

    return this.records
      .filter((r) => {
        if (r.tenant_id !== tenantId) return false;
        if (studentId && r.studentId !== studentId) return false;
        if (measureType && r.measureType !== measureType) return false;
        if (from && r.occurredOn < from) return false;
        if (to && r.occurredOn > to) return false;
        if (classRoomFilter && !classRoomFilter.has(r.studentId)) return false;
        return true;
      })
      .map(shapeRecord)
      .sort((a, b) =>
        a.occurredOn < b.occurredOn ? 1
        : a.occurredOn > b.occurredOn ? -1
        : a.created_at < b.created_at ? 1
        : -1
      );
  }

  listForStudent(tenantId, studentId) {
    return this.list(tenantId, { studentId });
  }

  listForParent(tenantId, parentId) {
    if (!this.parentStore) return [];
    const links = this.parentStore.listLinksByParent(tenantId, parentId);
    const studentIds = new Set(links.map((l) => l.studentId));
    return this.list(tenantId).filter((r) => studentIds.has(r.studentId));
  }

  get(tenantId, recordId) {
    const found = this.records.find((r) => r.tenant_id === tenantId && r.id === recordId);
    return found ? shapeRecord(found) : null;
  }

  create(tenantId, {
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

    const student = this.studentStore.get(tenantId, normalizedStudentId, { includeArchived: false });
    if (!student) {
      throw buildValidationError('studentId must reference an active student in tenant scope');
    }

    const now = new Date().toISOString();
    const created = {
      id: `discipline-${crypto.randomUUID()}`,
      tenant_id: tenantId,
      studentId: normalizedStudentId,
      recordedByUserId: normalizedRecorderId,
      recordedByRole: normalizedRecorderRole,
      measureType: normalizedType,
      occurredOn: normalizedOccurredOn,
      scheduledFor: normalizedScheduledFor,
      durationMinutes: normalizedDuration,
      description: normalizedDescription,
      created_at: now,
      updated_at: now
    };
    this.records.push(created);
    return shapeRecord(created);
  }

  delete(tenantId, recordId, { actorUserId, actorRole } = {}) {
    const index = this.records.findIndex((r) => r.tenant_id === tenantId && r.id === recordId);
    if (index < 0) {
      return null;
    }
    const record = this.records[index];
    const isOwner = actorUserId && record.recordedByUserId === actorUserId;
    const isAdmin = actorRole === 'school_admin' || actorRole === 'director';
    if (!isOwner && !isAdmin) {
      throw buildValidationError('Only the recording user or a school admin can delete this discipline record');
    }
    this.records.splice(index, 1);
    return shapeRecord(record);
  }
}

module.exports = {
  DisciplineStore,
  DISCIPLINE_MEASURE_TYPES,
  DISCIPLINE_MEASURE_LABELS_FR,
  DISCIPLINE_MEASURE_BADGES,
  MAX_DESCRIPTION_LENGTH,
  MAX_DURATION_MINUTES,
  MEASURES_REQUIRING_SCHEDULE,
  MEASURES_REQUIRING_DURATION,
  normalizeDescription,
  normalizeDurationMinutes,
  shapeRecord
};
