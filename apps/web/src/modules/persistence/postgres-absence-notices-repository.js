const crypto = require('node:crypto');

const {
  buildValidationError,
  requireDateString,
  requireString
} = require('../attendance');
const {
  ABSENCE_REASONS,
  normalizeOptionalComment,
  normalizeDocument
} = require('../absence-notices');

const SELECT_META_COLUMNS = `
  id,
  tenant_id,
  student_id AS "studentId",
  created_by_user_id AS "createdByUserId",
  start_date AS "startDate",
  end_date AS "endDate",
  reason,
  comment,
  status,
  document_file_name AS "documentFileName",
  document_mime_type AS "documentMimeType",
  document_size_bytes AS "documentSizeBytes",
  created_at,
  updated_at
`;

function mapMetaRow(row) {
  const hasDocument =
    Boolean(row.documentFileName) && Boolean(row.documentMimeType) && (row.documentSizeBytes ?? 0) > 0;
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    studentId: row.studentId,
    createdByUserId: row.createdByUserId,
    startDate: row.startDate,
    endDate: row.endDate,
    reason: row.reason,
    comment: row.comment,
    status: row.status,
    hasDocument,
    documentFileName: hasDocument ? row.documentFileName : null,
    documentMimeType: hasDocument ? row.documentMimeType : null,
    documentSizeBytes: hasDocument ? row.documentSizeBytes : null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

class PostgresAbsenceNoticesRepository {
  constructor({ pool, parentStore, studentStore }) {
    this.pool = pool;
    this.parentStore = parentStore;
    this.studentStore = studentStore;
  }

  async list(tenantId, { studentId, parentId, status } = {}) {
    const clauses = ['tenant_id = $1'];
    const params = [tenantId];
    if (studentId) {
      params.push(studentId);
      clauses.push(`student_id = $${params.length}`);
    }
    if (parentId) {
      params.push(parentId);
      clauses.push(`created_by_user_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      clauses.push(`status = $${params.length}`);
    }
    const result = await this.pool.query(
      `SELECT ${SELECT_META_COLUMNS} FROM absence_notices WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`,
      params
    );
    return result.rows.map(mapMetaRow);
  }

  async listForParent(tenantId, parentId) {
    return this.list(tenantId, { parentId });
  }

  async listForStudent(tenantId, studentId) {
    return this.list(tenantId, { studentId });
  }

  async get(tenantId, noticeId) {
    const result = await this.pool.query(
      `SELECT ${SELECT_META_COLUMNS} FROM absence_notices WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, noticeId]
    );
    return result.rows[0] ? mapMetaRow(result.rows[0]) : null;
  }

  async getDocument(tenantId, noticeId) {
    const result = await this.pool.query(
      `SELECT document_file_name AS "documentFileName",
              document_mime_type AS "documentMimeType",
              document_size_bytes AS "documentSizeBytes",
              document_data AS "documentData"
       FROM absence_notices
       WHERE tenant_id = $1 AND id = $2
       LIMIT 1`,
      [tenantId, noticeId]
    );
    const row = result.rows[0];
    if (!row || !row.documentData) {
      return null;
    }
    return {
      fileName: row.documentFileName,
      mimeType: row.documentMimeType,
      data: row.documentData,
      sizeBytes: row.documentSizeBytes
    };
  }

  async create(tenantId, {
    studentId,
    createdByUserId,
    startDate,
    endDate,
    reason,
    comment,
    document
  }) {
    const normalizedStartDate = requireDateString(startDate, 'startDate');
    const normalizedEndDate = requireDateString(endDate, 'endDate');
    if (normalizedEndDate < normalizedStartDate) {
      throw buildValidationError('endDate must be greater than or equal to startDate');
    }

    const normalizedStudentId = requireString(studentId, 'studentId', 2, 120);
    const normalizedParentId = requireString(createdByUserId, 'createdByUserId', 2, 120);
    const normalizedReason = requireString(reason, 'reason', 2, 40);
    if (!ABSENCE_REASONS.includes(normalizedReason)) {
      throw buildValidationError(
        `reason must be one of: ${ABSENCE_REASONS.join(', ')}`
      );
    }

    const normalizedComment = normalizeOptionalComment(comment);
    const normalizedDocument = normalizeDocument(document);

    const student = await this.studentStore.get(tenantId, normalizedStudentId, { includeArchived: false });
    if (!student) {
      throw buildValidationError('studentId must reference an active student in tenant scope');
    }

    const links = await this.parentStore.listLinksByStudent(tenantId, normalizedStudentId);
    const isLinked = links.some((link) => link.parentId === normalizedParentId);
    if (!isLinked) {
      throw buildValidationError('Only a parent linked to this student can declare an absence');
    }

    const id = `absence-notice-${crypto.randomUUID()}`;
    const result = await this.pool.query(
      `INSERT INTO absence_notices
         (id, tenant_id, student_id, created_by_user_id, start_date, end_date,
          reason, comment, status,
          document_file_name, document_mime_type, document_data, document_size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10, $11, $12)
       RETURNING ${SELECT_META_COLUMNS}`,
      [
        id,
        tenantId,
        normalizedStudentId,
        normalizedParentId,
        normalizedStartDate,
        normalizedEndDate,
        normalizedReason,
        normalizedComment,
        normalizedDocument?.fileName ?? null,
        normalizedDocument?.mimeType ?? null,
        normalizedDocument?.data ?? null,
        normalizedDocument?.sizeBytes ?? null
      ]
    );
    return mapMetaRow(result.rows[0]);
  }
}

module.exports = { PostgresAbsenceNoticesRepository };
