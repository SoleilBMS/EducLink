class TeacherService {
  constructor({ teacherStore }) {
    this.teacherStore = teacherStore;
  }

  listTeachers(tenantId) {
    return this.teacherStore.list(tenantId);
  }

  getTeacher(tenantId, teacherId) {
    return this.teacherStore.get(tenantId, teacherId);
  }

  createTeacher(tenantId, payload) {
    return this.teacherStore.create(tenantId, payload);
  }

  updateTeacher(tenantId, teacherId, payload) {
    return this.teacherStore.update(tenantId, teacherId, payload);
  }

  archiveTeacher(tenantId, teacherId) {
    return this.teacherStore.archive(tenantId, teacherId);
  }
}

module.exports = { TeacherService };
