const crypto = require('node:crypto');
const { buildValidationError, LINK_RELATIONSHIP } = require('../parent');

function optionalBoolean(value, fieldName) {
  if (value === undefined || value === null || value === '') return false;
  if (typeof value === 'boolean') return value;
  throw buildValidationError(`${fieldName} must be a boolean`);
}

function requireString(value, fieldName, min = 1, max = 120) {
  if (typeof value !== 'string') throw buildValidationError(`${fieldName} is required`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw buildValidationError(`${fieldName} must be between ${min} and ${max} characters`);
  return normalized;
}
function optionalString(value, fieldName, max = 120) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw buildValidationError(`${fieldName} must be a string`);
  const normalized = value.trim();
  if (normalized.length > max) throw buildValidationError(`${fieldName} must be at most ${max} characters`);
  return normalized;
}
function optionalEmail(value) {
  if (value === undefined || value === null || value === '') return '';
  const normalized = requireString(value, 'email', 5, 180).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw buildValidationError('email must be valid');
  return normalized;
}
function validateParentInput(input) { return { firstName: requireString(input.firstName, 'firstName', 1, 80), lastName: requireString(input.lastName, 'lastName', 1, 80), phone: optionalString(input.phone, 'phone', 40), email: optionalEmail(input.email), address: optionalString(input.address, 'address', 240), notes: optionalString(input.notes, 'notes', 500) }; }
function validateLinkInput(input) {
  const relationship = optionalString(input.relationship, 'relationship', 30).toLowerCase() || LINK_RELATIONSHIP.GUARDIAN;
  if (!Object.values(LINK_RELATIONSHIP).includes(relationship)) throw buildValidationError(`relationship must be one of: ${Object.values(LINK_RELATIONSHIP).join(', ')}`);
  return { relationship, isPrimaryContact: optionalBoolean(input.isPrimaryContact, 'isPrimaryContact') };
}

const mapParent = (r) => ({ id: r.id, tenant_id: r.tenant_id, firstName: r.firstName, lastName: r.lastName, phone: r.phone, email: r.email, address: r.address, notes: r.notes, archived_at: r.archived_at, created_at: r.created_at, updated_at: r.updated_at });
const mapLink = (r) => ({ id: r.id, tenant_id: r.tenant_id, parentId: r.parentId, studentId: r.studentId, relationship: r.relationship, isPrimaryContact: r.isPrimaryContact, created_at: r.created_at, updated_at: r.updated_at });

class PostgresParentRepository {
  constructor({ pool, studentStore }) { this.pool = pool; this.studentStore = studentStore; }
  async list(tenantId, { includeArchived = false } = {}) {
    const result = await this.pool.query(`SELECT id, tenant_id, first_name AS "firstName", last_name AS "lastName", phone, email, address, notes, archived_at, created_at, updated_at FROM parents WHERE tenant_id = $1 ${includeArchived ? '' : 'AND archived_at IS NULL'} ORDER BY created_at DESC`, [tenantId]);
    return result.rows.map(mapParent);
  }
  async get(tenantId, id, { includeArchived = true } = {}) {
    const result = await this.pool.query(`SELECT id, tenant_id, first_name AS "firstName", last_name AS "lastName", phone, email, address, notes, archived_at, created_at, updated_at FROM parents WHERE tenant_id = $1 AND id = $2 ${includeArchived ? '' : 'AND archived_at IS NULL'} LIMIT 1`, [tenantId, id]);
    return result.rows[0] ? mapParent(result.rows[0]) : null;
  }
  async create(tenantId, input) {
    const p = validateParentInput(input);
    const result = await this.pool.query(`INSERT INTO parents (id, tenant_id, first_name, last_name, phone, email, address, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, tenant_id, first_name AS "firstName", last_name AS "lastName", phone, email, address, notes, archived_at, created_at, updated_at`, [`parent-${crypto.randomUUID()}`, tenantId, p.firstName, p.lastName, p.phone, p.email, p.address, p.notes]);
    return mapParent(result.rows[0]);
  }
  async update(tenantId, id, input) {
    const p = validateParentInput(input);
    const result = await this.pool.query(`UPDATE parents SET first_name=$1,last_name=$2,phone=$3,email=$4,address=$5,notes=$6,updated_at=NOW() WHERE tenant_id=$7 AND id=$8 RETURNING id, tenant_id, first_name AS "firstName", last_name AS "lastName", phone, email, address, notes, archived_at, created_at, updated_at`, [p.firstName, p.lastName, p.phone, p.email, p.address, p.notes, tenantId, id]);
    return result.rows[0] ? mapParent(result.rows[0]) : null;
  }
  async archive(tenantId, id) {
    const result = await this.pool.query(`UPDATE parents SET archived_at=NOW(),updated_at=NOW() WHERE tenant_id=$1 AND id=$2 RETURNING id, tenant_id, first_name AS "firstName", last_name AS "lastName", phone, email, address, notes, archived_at, created_at, updated_at`, [tenantId, id]);
    return result.rows[0] ? mapParent(result.rows[0]) : null;
  }
  async listLinksByParent(tenantId, parentId) {
    const result = await this.pool.query(`SELECT id, tenant_id, parent_id AS "parentId", student_id AS "studentId", relationship, is_primary_contact AS "isPrimaryContact", created_at, updated_at FROM student_parent_links WHERE tenant_id=$1 AND parent_id=$2`, [tenantId, parentId]);
    return result.rows.map(mapLink);
  }
  async listLinksByStudent(tenantId, studentId) {
    const result = await this.pool.query(`SELECT id, tenant_id, parent_id AS "parentId", student_id AS "studentId", relationship, is_primary_contact AS "isPrimaryContact", created_at, updated_at FROM student_parent_links WHERE tenant_id=$1 AND student_id=$2`, [tenantId, studentId]);
    return result.rows.map(mapLink);
  }
  async upsertLink(tenantId, parentId, studentId, input = {}) {
    const parent = await this.get(tenantId, parentId, { includeArchived: false }); if (!parent) throw buildValidationError('parentId must reference an existing parent in tenant scope');
    const student = await this.studentStore.get(tenantId, studentId, { includeArchived: false }); if (!student) throw buildValidationError('studentId must reference an existing student in tenant scope');
    const p = validateLinkInput(input);
    const result = await this.pool.query(`INSERT INTO student_parent_links (id, tenant_id, parent_id, student_id, relationship, is_primary_contact) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (tenant_id,parent_id,student_id) DO UPDATE SET relationship=EXCLUDED.relationship,is_primary_contact=EXCLUDED.is_primary_contact,updated_at=NOW() RETURNING id, tenant_id, parent_id AS "parentId", student_id AS "studentId", relationship, is_primary_contact AS "isPrimaryContact", created_at, updated_at`, [`splink-${crypto.randomUUID()}`, tenantId, parentId, studentId, p.relationship, p.isPrimaryContact]);
    return mapLink(result.rows[0]);
  }
  async getParentWithLinks(tenantId, parentId) {
    const parent = await this.get(tenantId, parentId, { includeArchived: true }); if (!parent) return null;
    const links = await this.listLinksByParent(tenantId, parentId);
    return { ...parent, links: await Promise.all(links.map(async (l) => ({ ...l, student: await this.studentStore.get(tenantId, l.studentId, { includeArchived: true }) }))) };
  }
}
module.exports = { PostgresParentRepository };
