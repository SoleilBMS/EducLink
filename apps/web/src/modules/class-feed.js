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

    const now = new Date(this.clock()).toISOString();
    const post = {
      id: `post-${crypto.randomUUID()}`,
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
    return { ...post };
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
}

module.exports = { ClassFeedStore, ClassFeedError };
