class AbsenceService {
  constructor({ noticesStore }) {
    this.noticesStore = noticesStore;
  }

  async listForParent(tenantId, parentId) {
    return this.noticesStore.listForParent(tenantId, parentId);
  }

  async listForStudent(tenantId, studentId) {
    return this.noticesStore.listForStudent(tenantId, studentId);
  }

  async listForAdmin(tenantId, { status, studentId } = {}) {
    return this.noticesStore.list(tenantId, { status, studentId });
  }

  async get(tenantId, noticeId) {
    return this.noticesStore.get(tenantId, noticeId);
  }

  async getDocument(tenantId, noticeId) {
    return this.noticesStore.getDocument(tenantId, noticeId);
  }

  async createForParent(tenantId, parentId, payload) {
    return this.noticesStore.create(tenantId, {
      ...payload,
      createdByUserId: parentId
    });
  }
}

module.exports = { AbsenceService };
