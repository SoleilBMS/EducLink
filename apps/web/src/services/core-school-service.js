class CoreSchoolService {
  constructor({ coreSchoolStore }) {
    this.coreSchoolStore = coreSchoolStore;
  }

  async listClassRooms(tenantId) {
    if (typeof this.coreSchoolStore.listClassRooms === 'function') {
      return this.coreSchoolStore.listClassRooms(tenantId);
    }

    return this.coreSchoolStore.list('classRooms', tenantId);
  }

  async listSubjects(tenantId) {
    if (typeof this.coreSchoolStore.listSubjects === 'function') {
      return this.coreSchoolStore.listSubjects(tenantId);
    }

    return this.coreSchoolStore.list('subjects', tenantId);
  }

  async getClassRoom(tenantId, classRoomId) {
    if (typeof this.coreSchoolStore.getClassRoom === 'function') {
      return this.coreSchoolStore.getClassRoom(tenantId, classRoomId);
    }

    return this.coreSchoolStore.get('classRooms', tenantId, classRoomId);
  }

  async getSubject(tenantId, subjectId) {
    if (typeof this.coreSchoolStore.getSubject === 'function') {
      return this.coreSchoolStore.getSubject(tenantId, subjectId);
    }

    return this.coreSchoolStore.get('subjects', tenantId, subjectId);
  }
}

module.exports = { CoreSchoolService };
