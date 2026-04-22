class CoreSchoolService {
  constructor({ coreSchoolStore }) {
    this.coreSchoolStore = coreSchoolStore;
  }

  listClassRooms(tenantId) {
    return this.coreSchoolStore.list('classRooms', tenantId);
  }

  listSubjects(tenantId) {
    return this.coreSchoolStore.list('subjects', tenantId);
  }

  getClassRoom(tenantId, classRoomId) {
    return this.coreSchoolStore.get('classRooms', tenantId, classRoomId);
  }

  getSubject(tenantId, subjectId) {
    return this.coreSchoolStore.get('subjects', tenantId, subjectId);
  }
}

module.exports = { CoreSchoolService };
