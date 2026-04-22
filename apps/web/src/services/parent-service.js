class ParentService {
  constructor({ parentStore, studentStore, buildValidationError }) {
    this.parentStore = parentStore;
    this.studentStore = studentStore;
    this.buildValidationError = buildValidationError;
  }

  listParents(tenantId) {
    return this.parentStore.list(tenantId);
  }

  getParentWithLinks(tenantId, parentId) {
    return this.parentStore.getParentWithLinks(tenantId, parentId);
  }

  createParent(tenantId, payload) {
    return this.parentStore.create(tenantId, payload);
  }

  updateParent(tenantId, parentId, payload) {
    return this.parentStore.update(tenantId, parentId, payload);
  }

  archiveParent(tenantId, parentId) {
    return this.parentStore.archive(tenantId, parentId);
  }

  upsertParentLinks(tenantId, parentId, payload) {
    if (!Array.isArray(payload.studentIds) || payload.studentIds.length === 0) {
      throw this.buildValidationError('studentIds must be a non-empty array');
    }

    return payload.studentIds.map((studentId) =>
      this.parentStore.upsertLink(tenantId, parentId, studentId, {
        relationship: payload.relationship,
        isPrimaryContact: payload.isPrimaryContact
      })
    );
  }

  listParentsForStudent(tenantId, studentId) {
    const student = this.studentStore.get(tenantId, studentId, { includeArchived: false });
    if (!student) {
      return null;
    }

    return this.parentStore.listLinksByStudent(tenantId, studentId).map((link) => ({
      ...link,
      parent: this.parentStore.get(tenantId, link.parentId, { includeArchived: true })
    }));
  }
}

module.exports = { ParentService };
