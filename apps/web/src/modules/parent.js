const crypto = require('node:crypto');

const { buildValidationError } = require('./error-utils');

const LINK_RELATIONSHIP = Object.freeze({
  MOTHER: 'mother',
  FATHER: 'father',
  GUARDIAN: 'guardian',
  OTHER: 'other'
});

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

function optionalString(value, fieldName, max = 120) {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  if (typeof value !== 'string') {
    throw buildValidationError(`${fieldName} must be a string`);
  }

  const normalized = value.trim();
  if (normalized.length > max) {
    throw buildValidationError(`${fieldName} must be at most ${max} characters`);
  }

  return normalized;
}

function optionalEmail(value) {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  const normalized = requireString(value, 'email', 5, 180).toLowerCase();
  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  if (!isValid) {
    throw buildValidationError('email must be valid');
  }

  return normalized;
}

function optionalBoolean(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return false;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'on') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
  }

  throw buildValidationError(`${fieldName} must be a boolean`);
}

function validateParentInput(input) {
  return {
    firstName: requireString(input.firstName, 'firstName', 1, 80),
    lastName: requireString(input.lastName, 'lastName', 1, 80),
    phone: optionalString(input.phone, 'phone', 40),
    email: optionalEmail(input.email),
    address: optionalString(input.address, 'address', 240),
    notes: optionalString(input.notes, 'notes', 500)
  };
}

function validateLinkInput(input) {
  const relationship = optionalString(input.relationship, 'relationship', 30).toLowerCase() || LINK_RELATIONSHIP.GUARDIAN;
  if (!Object.values(LINK_RELATIONSHIP).includes(relationship)) {
    throw buildValidationError(`relationship must be one of: ${Object.values(LINK_RELATIONSHIP).join(', ')}`);
  }

  return {
    relationship,
    isPrimaryContact: optionalBoolean(input.isPrimaryContact, 'isPrimaryContact')
  };
}

class ParentStore {
  constructor({ parents = [], links = [], studentStore }) {
    this.parents = [...parents];
    this.links = [...links];
    this.studentStore = studentStore;
  }

  list(tenantId, { includeArchived = false } = {}) {
    return this.parents.filter((parent) => {
      if (parent.tenant_id !== tenantId) {
        return false;
      }

      if (!includeArchived && parent.archived_at) {
        return false;
      }

      return true;
    });
  }

  get(tenantId, id, { includeArchived = true } = {}) {
    const parent = this.parents.find((item) => item.id === id && item.tenant_id === tenantId);
    if (!parent) {
      return null;
    }

    if (!includeArchived && parent.archived_at) {
      return null;
    }

    return parent;
  }

  create(tenantId, input) {
    const payload = validateParentInput(input);
    const createdAt = new Date().toISOString();

    const parent = {
      id: `parent-${crypto.randomUUID()}`,
      tenant_id: tenantId,
      ...payload,
      archived_at: null,
      created_at: createdAt,
      updated_at: createdAt
    };

    this.parents.push(parent);
    return parent;
  }

  update(tenantId, id, input) {
    const index = this.parents.findIndex((item) => item.id === id && item.tenant_id === tenantId);
    if (index < 0) {
      return null;
    }

    const payload = validateParentInput(input);
    const updated = {
      ...this.parents[index],
      ...payload,
      updated_at: new Date().toISOString()
    };

    this.parents[index] = updated;
    return updated;
  }

  archive(tenantId, id) {
    const index = this.parents.findIndex((item) => item.id === id && item.tenant_id === tenantId);
    if (index < 0) {
      return null;
    }

    const archivedAt = new Date().toISOString();
    const archived = {
      ...this.parents[index],
      archived_at: archivedAt,
      updated_at: archivedAt
    };

    this.parents[index] = archived;
    return archived;
  }

  listLinksByParent(tenantId, parentId) {
    return this.links.filter((link) => link.tenant_id === tenantId && link.parentId === parentId);
  }

  listLinksByStudent(tenantId, studentId) {
    return this.links.filter((link) => link.tenant_id === tenantId && link.studentId === studentId);
  }

  upsertLink(tenantId, parentId, studentId, input = {}) {
    const parent = this.get(tenantId, parentId, { includeArchived: false });
    if (!parent) {
      throw buildValidationError('parentId must reference an existing parent in tenant scope');
    }

    const student = this.studentStore.get(tenantId, studentId, { includeArchived: false });
    if (!student) {
      throw buildValidationError('studentId must reference an existing student in tenant scope');
    }

    const payload = validateLinkInput(input);
    const now = new Date().toISOString();
    const index = this.links.findIndex((item) => item.parentId === parentId && item.studentId === studentId && item.tenant_id === tenantId);

    if (index < 0) {
      const created = {
        id: `splink-${crypto.randomUUID()}`,
        tenant_id: tenantId,
        parentId,
        studentId,
        relationship: payload.relationship,
        isPrimaryContact: payload.isPrimaryContact,
        created_at: now,
        updated_at: now
      };
      this.links.push(created);
      return created;
    }

    const updated = {
      ...this.links[index],
      relationship: payload.relationship,
      isPrimaryContact: payload.isPrimaryContact,
      updated_at: now
    };
    this.links[index] = updated;
    return updated;
  }

  upsertLinksBatch(tenantId, parentId, studentIds, input = {}) {
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      throw buildValidationError('studentIds must be a non-empty array');
    }

    const parent = this.get(tenantId, parentId, { includeArchived: false });
    if (!parent) {
      throw buildValidationError('parentId must reference an existing parent in tenant scope');
    }

    const payload = validateLinkInput(input);
    for (const studentId of studentIds) {
      const student = this.studentStore.get(tenantId, studentId, { includeArchived: false });
      if (!student) {
        throw buildValidationError('studentId must reference an existing student in tenant scope');
      }
    }

    const now = new Date().toISOString();
    const nextLinks = [...this.links];
    const upsertedLinks = [];

    for (const studentId of studentIds) {
      const index = nextLinks.findIndex((item) => item.parentId === parentId && item.studentId === studentId && item.tenant_id === tenantId);

      if (index < 0) {
        const created = {
          id: `splink-${crypto.randomUUID()}`,
          tenant_id: tenantId,
          parentId,
          studentId,
          relationship: payload.relationship,
          isPrimaryContact: payload.isPrimaryContact,
          created_at: now,
          updated_at: now
        };
        nextLinks.push(created);
        upsertedLinks.push(created);
        continue;
      }

      const updated = {
        ...nextLinks[index],
        relationship: payload.relationship,
        isPrimaryContact: payload.isPrimaryContact,
        updated_at: now
      };
      nextLinks[index] = updated;
      upsertedLinks.push(updated);
    }

    this.links = nextLinks;
    return upsertedLinks;
  }

  getParentWithLinks(tenantId, parentId) {
    const parent = this.get(tenantId, parentId, { includeArchived: true });
    if (!parent) {
      return null;
    }

    const links = this.listLinksByParent(tenantId, parentId).map((link) => ({
      ...link,
      student: this.studentStore.get(tenantId, link.studentId, { includeArchived: true })
    }));

    return {
      ...parent,
      links
    };
  }
}

module.exports = {
  ParentStore,
  LINK_RELATIONSHIP,
  buildValidationError
};
