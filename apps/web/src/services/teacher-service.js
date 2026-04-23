class TeacherService {
  constructor({ teacherStore }) {
    this.teacherStore = teacherStore;
  }

  async listTeachers(tenantId) {
    return this.teacherStore.list(tenantId);
  }

  async getTeacher(tenantId, teacherId) {
    return this.teacherStore.get(tenantId, teacherId);
  }

  async createTeacher(tenantId, payload) {
    return this.teacherStore.create(tenantId, payload);
  }

  async updateTeacher(tenantId, teacherId, payload) {
    return this.teacherStore.update(tenantId, teacherId, payload);
  }

  async archiveTeacher(tenantId, teacherId) {
    return this.teacherStore.archive(tenantId, teacherId);
  }
}

module.exports = { TeacherService };
