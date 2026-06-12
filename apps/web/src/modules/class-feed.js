const crypto = require('node:crypto');

class ClassFeedError extends Error {
  constructor(message, { code = 'class_feed_error', status = 422 } = {}) {
    super(message);
    this.name = 'ClassFeedError';
    this.code = code;
    this.status = status;
  }
}

function validationError(message) {
  return new ClassFeedError(message, { code: 'validation_error', status: 422 });
}

function requireString(value, field, { min = 1, max = 5000 } = {}) {
  if (typeof value !== 'string') throw validationError(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length < min) throw validationError(`${field} must be at least ${min} characters`);
  if (trimmed.length > max) throw validationError(`${field} must be at most ${max} characters`);
  return trimmed;
}

const ALLOWED_ATTACHMENT_MIMES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_POST = 8;
const EDIT_WINDOW_MS = 60 * 60 * 1000;
const POST_DELETE_ROLES = new Set(['school_admin', 'director']);

function validateAttachments(attachments) {
  if (attachments.length > MAX_ATTACHMENTS_PER_POST) {
    throw validationError(`attachments must be at most ${MAX_ATTACHMENTS_PER_POST} items`);
  }
  attachments.forEach((att, idx) => {
    if (!att || typeof att !== 'object') throw validationError(`attachments[${idx}] must be an object`);
    requireString(att.fileName, `attachments[${idx}].fileName`, { min: 1, max: 180 });
    if (!ALLOWED_ATTACHMENT_MIMES.includes(att.mimeType)) {
      throw validationError(`attachments[${idx}].mimeType must be one of: ${ALLOWED_ATTACHMENT_MIMES.join(', ')}`);
    }
    if (!Buffer.isBuffer(att.data)) throw validationError(`attachments[${idx}].data must be a Buffer`);
    if (att.data.length === 0) throw validationError(`attachments[${idx}].data must not be empty`);
    if (att.data.length > MAX_ATTACHMENT_BYTES) {
      throw validationError(`attachments[${idx}].data must be at most ${MAX_ATTACHMENT_BYTES} bytes`);
    }
  });
}

class ClassFeedStore {
  constructor({ posts = [], attachments = [], comments = [], likes = [], reads = [], clock = Date.now } = {}) {
    this.posts = posts.map((p) => ({ ...p }));
    this.attachments = attachments.map((a) => ({ ...a }));
    this.comments = comments.map((c) => ({ ...c }));
    this.likes = likes.map((l) => ({ ...l }));
    this.reads = reads.map((r) => ({ ...r }));
    this.clock = clock;
  }

  createPost(tenantId, author, { classRoomId, body, attachments = [] }) {
    const trimmedBody = requireString(body, 'body', { min: 1, max: 5000 });
    if (classRoomId !== null && typeof classRoomId !== 'string') {
      throw validationError('classRoomId must be a string or null');
    }
    if (!Array.isArray(attachments)) throw validationError('attachments must be an array');
    validateAttachments(attachments);

    const now = new Date(this.clock()).toISOString();
    const postId = `post-${crypto.randomUUID()}`;
    const post = {
      id: postId,
      tenantId,
      authorUserId: author.userId,
      classRoomId: classRoomId ?? null,
      body: trimmedBody,
      createdAt: now,
      updatedAt: now,
      editedAt: null,
      deletedAt: null
    };
    this.posts.push(post);

    const storedAttachments = attachments.map((att, idx) => {
      const stored = {
        id: `att-${crypto.randomUUID()}`,
        postId,
        position: idx,
        fileName: att.fileName.trim(),
        mimeType: att.mimeType,
        sizeBytes: att.data.length,
        data: att.data
      };
      this.attachments.push(stored);
      return stored;
    });

    return { ...post, attachments: storedAttachments.map((a) => ({ ...a })) };
  }

  getPost(tenantId, postId, { includeDeleted = false } = {}) {
    const post = this.posts.find((p) => p.id === postId && p.tenantId === tenantId);
    if (!post) return null;
    if (!includeDeleted && post.deletedAt) return null;
    return { ...post };
  }

  listPostsForClass(tenantId, classRoomId, { limit = 20, before = null } = {}) {
    return this.posts
      .filter((p) => p.tenantId === tenantId && p.classRoomId === classRoomId && !p.deletedAt)
      .filter((p) => !before || p.createdAt < before)
      .sort((a, b) => (b.createdAt < a.createdAt ? -1 : b.createdAt > a.createdAt ? 1 : 0))
      .slice(0, limit)
      .map((p) => ({ ...p }));
  }

  getAttachment(tenantId, attachmentId) {
    const att = this.attachments.find((a) => a.id === attachmentId);
    if (!att) return null;
    const post = this.posts.find((p) => p.id === att.postId && p.tenantId === tenantId);
    if (!post) return null;
    return { ...att };
  }

  editPost(tenantId, postId, actorUserId, { body, attachments = [] }, { now }) {
    const post = this.posts.find((p) => p.id === postId && p.tenantId === tenantId && !p.deletedAt);
    if (!post) return null;
    if (post.authorUserId !== actorUserId) {
      throw new ClassFeedError('Only the author can edit this post', { code: 'forbidden', status: 403 });
    }
    const createdAtMs = Date.parse(post.createdAt);
    if (now - createdAtMs > EDIT_WINDOW_MS) {
      throw new ClassFeedError('Edit window expired (1h)', { code: 'edit_window_expired', status: 422 });
    }

    const trimmedBody = requireString(body, 'body', { min: 1, max: 5000 });
    if (!Array.isArray(attachments)) throw validationError('attachments must be an array');
    validateAttachments(attachments);

    const nowIso = new Date(now).toISOString();
    post.body = trimmedBody;
    post.updatedAt = nowIso;
    post.editedAt = nowIso;

    this.attachments = this.attachments.filter((a) => a.postId !== postId);
    attachments.forEach((att, idx) => {
      this.attachments.push({
        id: `att-${crypto.randomUUID()}`,
        postId,
        position: idx,
        fileName: att.fileName.trim(),
        mimeType: att.mimeType,
        sizeBytes: att.data.length,
        data: att.data
      });
    });
    return { ...post };
  }

  softDeletePost(tenantId, postId, actorUserId, actorRole) {
    const post = this.posts.find((p) => p.id === postId && p.tenantId === tenantId && !p.deletedAt);
    if (!post) return null;
    if (post.authorUserId !== actorUserId && !POST_DELETE_ROLES.has(actorRole)) {
      throw new ClassFeedError('Only the author or admin/director can delete this post', { code: 'forbidden', status: 403 });
    }
    post.deletedAt = new Date(this.clock()).toISOString();
    return { ...post };
  }
}

module.exports = { ClassFeedStore, ClassFeedError };
