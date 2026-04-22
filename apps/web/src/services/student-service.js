class StudentService {
  constructor({ studentStore, coreSchoolService }) {
    this.studentStore = studentStore;
    this.coreSchoolService = coreSchoolService;
  }

  listStudents(tenantId, { classRoomId } = {}) {
    return this.studentStore.list(tenantId, { classRoomId });
  }

  getStudent(tenantId, studentId, options) {
    return this.studentStore.get(tenantId, studentId, options);
  }

  createStudent(tenantId, payload) {
    return this.studentStore.create(tenantId, payload);
  }

  updateStudent(tenantId, studentId, payload) {
    return this.studentStore.update(tenantId, studentId, payload);
  }

  archiveStudent(tenantId, studentId) {
    return this.studentStore.archive(tenantId, studentId);
  }

  listClassRooms(tenantId) {
    return this.coreSchoolService.listClassRooms(tenantId);
  }

  listSubjects(tenantId) {
    return this.coreSchoolService.listSubjects(tenantId);
  }
}

module.exports = { StudentService };
