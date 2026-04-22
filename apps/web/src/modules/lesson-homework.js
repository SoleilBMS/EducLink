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

function validateLessonLogInput(input) {
  return {
    classRoomId: requireString(input.classRoomId, 'classRoomId', 2, 120),
    subjectId: requireString(input.subjectId, 'subjectId', 2, 120),
    teacherId: requireString(input.teacherId, 'teacherId', 2, 120),
    date: requireDateString(input.date, 'date'),
    content: requireString(input.content, 'content', 3, 2000)
  };
}

function validateHomeworkInput(input) {
  return {
    classRoomId: requireString(input.classRoomId, 'classRoomId', 2, 120),
    subjectId: requireString(input.subjectId, 'subjectId', 2, 120),
    teacherId: requireString(input.teacherId, 'teacherId', 2, 120),
    dueDate: requireDateString(input.dueDate, 'dueDate'),
    title: requireString(input.title, 'title', 2, 180),
    description: requireString(input.description, 'description', 3, 2000)
  };
}

class LessonHomeworkStore {
  constructor({ lessonLogs = [], homeworks = [], classRoomStore, teacherStore, studentStore, parentStore }) {
    this.lessonLogs = [...lessonLogs];
    this.homeworks = [...homeworks];
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

  createLessonLog(tenantId, input) {
    const payload = validateLessonLogInput(input);
    this.assertClassAndSubject(tenantId, payload.classRoomId, payload.subjectId);
    this.assertTeacherAssignment(tenantId, payload.teacherId, payload.classRoomId, payload.subjectId);

    const now = new Date().toISOString();
    const created = {
      id: `lesson-log-${crypto.randomUUID()}`,
      tenant_id: tenantId,
      ...payload,
      created_at: now,
      updated_at: now
    };

    this.lessonLogs.push(created);
    return created;
  }

  listLessonLogsForTeacher(tenantId, teacherId) {
    return this.lessonLogs
      .filter((item) => item.tenant_id === tenantId && item.teacherId === teacherId)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  createHomework(tenantId, input) {
    const payload = validateHomeworkInput(input);
    this.assertClassAndSubject(tenantId, payload.classRoomId, payload.subjectId);
    this.assertTeacherAssignment(tenantId, payload.teacherId, payload.classRoomId, payload.subjectId);

    const now = new Date().toISOString();
    const created = {
      id: `homework-${crypto.randomUUID()}`,
      tenant_id: tenantId,
      assignedDate: now.slice(0, 10),
      ...payload,
      created_at: now,
      updated_at: now
    };

    this.homeworks.push(created);
    return created;
  }

  listHomeworksForTeacher(tenantId, teacherId) {
    return this.homeworks
      .filter((item) => item.tenant_id === tenantId && item.teacherId === teacherId)
      .sort((a, b) => {
        if (a.dueDate === b.dueDate) {
          return a.created_at < b.created_at ? 1 : -1;
        }
        return a.dueDate < b.dueDate ? 1 : -1;
      });
  }

  listHomeworksForStudent(tenantId, studentId) {
    const student = this.studentStore.get(tenantId, studentId, { includeArchived: false });
    if (!student) {
      return [];
    }

    return this.homeworks
      .filter((item) => item.tenant_id === tenantId && item.classRoomId === student.classRoomId)
      .sort((a, b) => (a.dueDate > b.dueDate ? 1 : -1));
  }

  listHomeworksForParent(tenantId, parentId) {
    const links = this.parentStore.listLinksByParent(tenantId, parentId);
    const students = links
      .map((link) => this.studentStore.get(tenantId, link.studentId, { includeArchived: false }))
      .filter(Boolean);

    const classRoomIds = new Set(students.map((student) => student.classRoomId));
    const studentByClass = new Map();
    for (const student of students) {
      const existing = studentByClass.get(student.classRoomId) ?? [];
      existing.push(student);
      studentByClass.set(student.classRoomId, existing);
    }

    return this.homeworks
      .filter((item) => item.tenant_id === tenantId && classRoomIds.has(item.classRoomId))
      .map((homework) => ({
        ...homework,
        students: studentByClass.get(homework.classRoomId) ?? []
      }))
      .sort((a, b) => (a.dueDate > b.dueDate ? 1 : -1));
  }
}

module.exports = {
  LessonHomeworkStore
};
