class StudentService {
  constructor({ studentStore, coreSchoolService }) {
    this.studentStore = studentStore;
    this.coreSchoolService = coreSchoolService;
  }

  async listStudents(tenantId, { classRoomId } = {}) {
    return this.studentStore.list(tenantId, { classRoomId });
  }

  async getStudent(tenantId, studentId, options) {
    return this.studentStore.get(tenantId, studentId, options);
  }

  async createStudent(tenantId, payload) {
    return this.studentStore.create(tenantId, payload);
  }

  async updateStudent(tenantId, studentId, payload) {
    return this.studentStore.update(tenantId, studentId, payload);
  }

  async archiveStudent(tenantId, studentId) {
    return this.studentStore.archive(tenantId, studentId);
  }

  async listClassRooms(tenantId) {
    return this.coreSchoolService.listClassRooms(tenantId);
  }

  async listSubjects(tenantId) {
    return this.coreSchoolService.listSubjects(tenantId);
  }
}

module.exports = { StudentService };
