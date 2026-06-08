const crypto = require('node:crypto');

const {
  buildValidationError,
  requireDateString,
  requireString
} = require('./attendance');

const ABSENCE_REASONS = ['maladie', 'rdv-medical', 'raison-familiale', 'autre'];

const ABSENCE_REASON_LABELS_FR = {
  maladie: 'Maladie',
  'rdv-medical': 'Rendez-vous médical',
  'raison-familiale': 'Raison familiale',
  autre: 'Autre motif'
};

const ABSENCE_STATUSES = ['pending', 'approved', 'rejected'];

const ABSENCE_STATUS_LABELS_FR = {
  pending: 'En attente',
  approved: 'Validée',
  rejected: 'Refusée'
};

const ABSENCE_STATUS_BADGES = {
  pending: 'is-warning',
  approved: 'is-success',
  rejected: 'is-error'
};

const ALLOWED_DOCUMENT_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

const MAX_DOCUMENT_SIZE_BYTES = 3 * 1024 * 1024;

const MAX_COMMENT_LENGTH = 500;

const MAX_FILE_NAME_LENGTH = 180;

const MAX_REVIEW_COMMENT_LENGTH = 500;

const REVIEW_DECISIONS = ['approve', 'reject'];

function normalizeOptionalComment(value) {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value !== 'string') {
    throw buildValidationError('comment must be a string');
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    throw buildValidationError(`comment must be at most ${MAX_COMMENT_LENGTH} characters`);
  }
  return trimmed;
}

function normalizeDocument(document) {
  if (document === undefined || document === null) {
    return null;
  }
  if (typeof document !== 'object') {
    throw buildValidationError('document must be an object');
  }

  const fileName = requireString(document.fileName, 'document.fileName', 1, MAX_FILE_NAME_LENGTH);
  const mimeType = requireString(document.mimeType, 'document.mimeType', 3, 120);
  if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(mimeType)) {
    throw buildValidationError(
      `document.mimeType must be one of: ${ALLOWED_DOCUMENT_MIME_TYPES.join(', ')}`
    );
  }

  if (!Buffer.isBuffer(document.data)) {
    throw buildValidationError('document.data must be a Buffer');
  }
  const size = document.data.length;
  if (size === 0) {
    throw buildValidationError('document.data must not be empty');
  }
  if (size > MAX_DOCUMENT_SIZE_BYTES) {
    throw buildValidationError(
      `document.data must be at most ${MAX_DOCUMENT_SIZE_BYTES} bytes`
    );
  }

  return { fileName, mimeType, data: document.data, sizeBytes: size };
}

function shapeNotice(record) {
  const hasDocument =
    Boolean(record.documentFileName) && Boolean(record.documentMimeType) && (record.documentSizeBytes ?? 0) > 0;
  return {
    id: record.id,
    tenant_id: record.tenant_id,
    studentId: record.studentId,
    createdByUserId: record.createdByUserId,
    startDate: record.startDate,
    endDate: record.endDate,
    reason: record.reason,
    comment: record.comment,
    status: record.status,
    hasDocument,
    documentFileName: hasDocument ? record.documentFileName : null,
    documentMimeType: hasDocument ? record.documentMimeType : null,
    documentSizeBytes: hasDocument ? record.documentSizeBytes : null,
    reviewedByUserId: record.reviewedByUserId ?? null,
    reviewedAt: record.reviewedAt ?? null,
    reviewComment: record.reviewComment ?? null,
    created_at: record.created_at,
    updated_at: record.updated_at
  };
}

function enumerateDateRange(startDate, endDate) {
  // Both inputs are YYYY-MM-DD strings already validated upstream.
  // We iterate calendar days inclusive on both ends. Weekend / holiday
  // skipping is intentionally out of scope (improvement tracked for VS-06).
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const dates = [];
  const cursor = new Date(start.getTime());
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function normalizeReviewComment(value, { required }) {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    if (required) {
      throw buildValidationError('review comment is required when rejecting a notice');
    }
    return '';
  }
  if (typeof value !== 'string') {
    throw buildValidationError('review comment must be a string');
  }
  const trimmed = value.trim();
  if (trimmed.length < 2 && required) {
    throw buildValidationError('review comment must be at least 2 characters');
  }
  if (trimmed.length > MAX_REVIEW_COMMENT_LENGTH) {
    throw buildValidationError(`review comment must be at most ${MAX_REVIEW_COMMENT_LENGTH} characters`);
  }
  return trimmed;
}

class AbsenceNoticesStore {
  constructor({ notices = [], parentStore, studentStore }) {
    this.notices = notices.map((notice) => ({ ...notice }));
    this.parentStore = parentStore;
    this.studentStore = studentStore;
  }

  list(tenantId, { studentId, parentId, status } = {}) {
    return this.notices
      .filter((notice) => {
        if (notice.tenant_id !== tenantId) {
          return false;
        }
        if (studentId && notice.studentId !== studentId) {
          return false;
        }
        if (parentId && notice.createdByUserId !== parentId) {
          return false;
        }
        if (status && notice.status !== status) {
          return false;
        }
        return true;
      })
      .map(shapeNotice)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  }

  listForParent(tenantId, parentId) {
    return this.list(tenantId, { parentId });
  }

  listForStudent(tenantId, studentId) {
    return this.list(tenantId, { studentId });
  }

  get(tenantId, noticeId) {
    const found = this.notices.find(
      (notice) => notice.tenant_id === tenantId && notice.id === noticeId
    );
    return found ? shapeNotice(found) : null;
  }

  getDocument(tenantId, noticeId) {
    const found = this.notices.find(
      (notice) => notice.tenant_id === tenantId && notice.id === noticeId
    );
    if (!found || !found.documentData) {
      return null;
    }
    return {
      fileName: found.documentFileName,
      mimeType: found.documentMimeType,
      data: found.documentData,
      sizeBytes: found.documentSizeBytes
    };
  }

  create(tenantId, {
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

    const student = this.studentStore.get(tenantId, normalizedStudentId, { includeArchived: false });
    if (!student) {
      throw buildValidationError('studentId must reference an active student in tenant scope');
    }

    const links = this.parentStore.listLinksByStudent(tenantId, normalizedStudentId);
    const isLinked = links.some((link) => link.parentId === normalizedParentId);
    if (!isLinked) {
      throw buildValidationError('Only a parent linked to this student can declare an absence');
    }

    const now = new Date().toISOString();
    const created = {
      id: `absence-notice-${crypto.randomUUID()}`,
      tenant_id: tenantId,
      studentId: normalizedStudentId,
      createdByUserId: normalizedParentId,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      reason: normalizedReason,
      comment: normalizedComment,
      status: 'pending',
      documentFileName: normalizedDocument?.fileName ?? null,
      documentMimeType: normalizedDocument?.mimeType ?? null,
      documentData: normalizedDocument?.data ?? null,
      documentSizeBytes: normalizedDocument?.sizeBytes ?? null,
      reviewedByUserId: null,
      reviewedAt: null,
      reviewComment: null,
      created_at: now,
      updated_at: now
    };
    this.notices.push(created);
    return shapeNotice(created);
  }

  review(tenantId, noticeId, { reviewerUserId, decision, comment } = {}) {
    const normalizedReviewerId = requireString(reviewerUserId, 'reviewerUserId', 2, 120);
    if (!REVIEW_DECISIONS.includes(decision)) {
      throw buildValidationError(`decision must be one of: ${REVIEW_DECISIONS.join(', ')}`);
    }

    const index = this.notices.findIndex(
      (notice) => notice.tenant_id === tenantId && notice.id === noticeId
    );
    if (index < 0) {
      return null;
    }
    const current = this.notices[index];
    if (current.status !== 'pending') {
      throw buildValidationError('This notice has already been reviewed');
    }

    const normalizedComment = normalizeReviewComment(comment, { required: decision === 'reject' });
    const now = new Date().toISOString();
    const nextStatus = decision === 'approve' ? 'approved' : 'rejected';
    const updated = {
      ...current,
      status: nextStatus,
      reviewedByUserId: normalizedReviewerId,
      reviewedAt: now,
      reviewComment: normalizedComment || null,
      updated_at: now
    };
    this.notices[index] = updated;

    const datesToSync = decision === 'approve'
      ? enumerateDateRange(current.startDate, current.endDate)
      : [];

    return { notice: shapeNotice(updated), datesToSync };
  }
}

module.exports = {
  AbsenceNoticesStore,
  ABSENCE_REASONS,
  ABSENCE_REASON_LABELS_FR,
  ABSENCE_STATUSES,
  ABSENCE_STATUS_LABELS_FR,
  ABSENCE_STATUS_BADGES,
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_SIZE_BYTES,
  MAX_COMMENT_LENGTH,
  MAX_FILE_NAME_LENGTH,
  MAX_REVIEW_COMMENT_LENGTH,
  REVIEW_DECISIONS,
  normalizeOptionalComment,
  normalizeDocument,
  normalizeReviewComment,
  shapeNotice,
  enumerateDateRange
};
