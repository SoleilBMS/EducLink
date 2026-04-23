const crypto = require('node:crypto');

const { requireDateString } = require('./attendance');
const { buildValidationError } = require('./teacher');

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

function optionalString(value, fieldName, max = 500) {
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

function parsePositiveNumber(value, fieldName, { min = 0, max = 100 } = {}) {
  if (value === undefined || value === null || value === '') {
    return min;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw buildValidationError(`${fieldName} must be a number`);
  }

  if (parsed < min || parsed > max) {
    throw buildValidationError(`${fieldName} must be between ${min} and ${max}`);
  }

  return Number(parsed.toFixed(2));
}

class GradingStore {
  constructor({ assessments = [], gradeEntries = [], classRoomStore, teacherStore, studentStore, parentStore }) {
    this.assessments = [...assessments];
    this.gradeEntries = [...gradeEntries];
    this.classRoomStore = classRoomStore;
    this.teacherStore = teacherStore;
    this.studentStore = studentStore;
    this.parentStore = parentStore;
  }

  assertTeacherAssignment(tenantId, teacherId, classRoomId, subjectId) {
    const teacher = this.teacherStore.get(tenantId, teacherId, { includeArchived: false });
    if (!teacher) {
      throw buildValidationError('teacherId must reference an active teacher in tenant scope');
    }

    if (!teacher.classRoomIds.includes(classRoomId)) {
      throw buildValidationError('Teacher is not authorized for this class room');
    }

    if (!teacher.subjectIds.includes(subjectId)) {
      throw buildValidationError('Teacher is not authorized for this subject');
    }

    return teacher;
  }

  assertClassAndSubject(tenantId, classRoomId, subjectId) {
    const classRoom = this.classRoomStore.get('classRooms', tenantId, classRoomId);
    if (!classRoom) {
      throw buildValidationError('classRoomId must reference an existing class room in tenant scope');
    }

    const subject = this.classRoomStore.get('subjects', tenantId, subjectId);
    if (!subject) {
      throw buildValidationError('subjectId must reference an existing subject in tenant scope');
    }
  }

  createAssessment(tenantId, input) {
    const payload = {
      classRoomId: requireString(input.classRoomId, 'classRoomId', 2, 120),
      subjectId: requireString(input.subjectId, 'subjectId', 2, 120),
      teacherId: requireString(input.teacherId, 'teacherId', 2, 120),
      title: requireString(input.title, 'title', 2, 180),
      date: requireDateString(input.date, 'date'),
      coefficient: parsePositiveNumber(input.coefficient, 'coefficient', { min: 0.1, max: 20 })
    };

    this.assertClassAndSubject(tenantId, payload.classRoomId, payload.subjectId);
    this.assertTeacherAssignment(tenantId, payload.teacherId, payload.classRoomId, payload.subjectId);

    const now = new Date().toISOString();
    const created = {
      id: `assessment-${crypto.randomUUID()}`,
      tenant_id: tenantId,
      ...payload,
      created_at: now,
      updated_at: now
    };

    this.assessments.push(created);
    return created;
  }

  listAssessmentsForTeacher(tenantId, teacherId) {
    return this.assessments
      .filter((item) => item.tenant_id === tenantId && item.teacherId === teacherId)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  listAssessmentsForTenant(tenantId) {
    return this.assessments
      .filter((item) => item.tenant_id === tenantId)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  getAssessment(tenantId, assessmentId) {
    return this.assessments.find((item) => item.id === assessmentId && item.tenant_id === tenantId) ?? null;
  }

  upsertGradesForAssessment(tenantId, { assessmentId, teacherId, entries }) {
    const assessment = this.getAssessment(tenantId, requireString(assessmentId, 'assessmentId', 2, 200));
    if (!assessment) {
      throw buildValidationError('assessmentId must reference an existing assessment in tenant scope');
    }

    if (assessment.teacherId !== teacherId) {
      throw buildValidationError('Teacher is not authorized for this assessment');
    }

    this.assertTeacherAssignment(tenantId, teacherId, assessment.classRoomId, assessment.subjectId);

    if (!Array.isArray(entries) || entries.length === 0) {
      throw buildValidationError('entries must be a non-empty array');
    }

    const allowedStudentIds = new Set(this.studentStore.list(tenantId, { classRoomId: assessment.classRoomId }).map((student) => student.id));
    const now = new Date().toISOString();
    const saved = [];

    for (const entry of entries) {
      const studentId = requireString(entry.studentId, 'studentId', 2, 120);
      const score = parsePositiveNumber(entry.score, 'score', { min: 0, max: 20 });
      const remark = optionalString(entry.remark, 'remark', 500);

      if (!allowedStudentIds.has(studentId)) {
        throw buildValidationError('studentId must reference an active student in the assessment class room and tenant');
      }

      const index = this.gradeEntries.findIndex((item) => item.tenant_id === tenantId && item.assessmentId === assessment.id && item.studentId === studentId);
      if (index >= 0) {
        const updated = {
          ...this.gradeEntries[index],
          score,
          remark,
          updated_at: now
        };
        this.gradeEntries[index] = updated;
        saved.push(updated);
      } else {
        const created = {
          id: `grade-entry-${crypto.randomUUID()}`,
          tenant_id: tenantId,
          assessmentId: assessment.id,
          classRoomId: assessment.classRoomId,
          subjectId: assessment.subjectId,
          teacherId,
          studentId,
          date: assessment.date,
          score,
          remark,
          created_at: now,
          updated_at: now
        };
        this.gradeEntries.push(created);
        saved.push(created);
      }
    }

    return saved;
  }

  listGradesForTeacher(tenantId, teacherId) {
    const assessments = this.listAssessmentsForTeacher(tenantId, teacherId);
    const byAssessmentId = new Map(assessments.map((assessment) => [assessment.id, assessment]));
    return this.gradeEntries
      .filter((entry) => entry.tenant_id === tenantId && byAssessmentId.has(entry.assessmentId))
      .map((entry) => ({ ...entry, assessment: byAssessmentId.get(entry.assessmentId) }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  listGradesForStudent(tenantId, studentId) {
    const assessmentsById = new Map(this.assessments.filter((item) => item.tenant_id === tenantId).map((assessment) => [assessment.id, assessment]));

    return this.gradeEntries
      .filter((entry) => entry.tenant_id === tenantId && entry.studentId === studentId)
      .map((entry) => ({ ...entry, assessment: assessmentsById.get(entry.assessmentId) ?? null }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  listGradesForParent(tenantId, parentId) {
    const linkedStudentIds = new Set(this.parentStore.listLinksByParent(tenantId, parentId).map((link) => link.studentId));
    const studentById = new Map(
      [...linkedStudentIds]
        .map((studentId) => this.studentStore.get(tenantId, studentId, { includeArchived: false }))
        .filter(Boolean)
        .map((student) => [student.id, student])
    );
    const assessmentsById = new Map(this.assessments.filter((item) => item.tenant_id === tenantId).map((assessment) => [assessment.id, assessment]));

    return this.gradeEntries
      .filter((entry) => entry.tenant_id === tenantId && studentById.has(entry.studentId))
      .map((entry) => ({
        ...entry,
        assessment: assessmentsById.get(entry.assessmentId) ?? null,
        student: studentById.get(entry.studentId)
      }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  listGradesForTenant(tenantId) {
    const assessmentsById = new Map(this.assessments.filter((item) => item.tenant_id === tenantId).map((assessment) => [assessment.id, assessment]));
    return this.gradeEntries
      .filter((entry) => entry.tenant_id === tenantId)
      .map((entry) => ({ ...entry, assessment: assessmentsById.get(entry.assessmentId) ?? null }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }
}

module.exports = {
  GradingStore
};
