class ParentService {
  constructor({ parentStore, studentStore, buildValidationError }) {
    this.parentStore = parentStore;
    this.studentStore = studentStore;
    this.buildValidationError = buildValidationError;
  }

  async listParents(tenantId) {
    return this.parentStore.list(tenantId);
  }

  async getParentWithLinks(tenantId, parentId) {
    return this.parentStore.getParentWithLinks(tenantId, parentId);
  }

  async createParent(tenantId, payload) {
    return this.parentStore.create(tenantId, payload);
  }

  async updateParent(tenantId, parentId, payload) {
    return this.parentStore.update(tenantId, parentId, payload);
  }

  async archiveParent(tenantId, parentId) {
    return this.parentStore.archive(tenantId, parentId);
  }

  async upsertParentLinks(tenantId, parentId, payload) {
    if (!Array.isArray(payload.studentIds) || payload.studentIds.length === 0) {
      throw this.buildValidationError('studentIds must be a non-empty array');
    }

    return Promise.all(
      payload.studentIds.map((studentId) =>
        this.parentStore.upsertLink(tenantId, parentId, studentId, {
          relationship: payload.relationship,
          isPrimaryContact: payload.isPrimaryContact
        })
      )
    );
  }

  async listParentsForStudent(tenantId, studentId) {
    const student = await this.studentStore.get(tenantId, studentId, { includeArchived: false });
    if (!student) {
      return null;
    }

    const links = await this.parentStore.listLinksByStudent(tenantId, studentId);
    return Promise.all(
      links.map(async (link) => ({
        ...link,
        parent: await this.parentStore.get(tenantId, link.parentId, { includeArchived: true })
      }))
    );
  }
}

module.exports = { ParentService };
