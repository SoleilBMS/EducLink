const crypto = require('node:crypto');
const { ClassFeedError } = require('../class-feed');

const EDIT_WINDOW_MS = 60 * 60 * 1000;
const ALLOWED_ATTACHMENT_MIMES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_POST = 8;
const POST_DELETE_ROLES = new Set(['school_admin', 'director']);
const COMMENT_DELETE_ROLES = new Set(['school_admin', 'director']);

function validationError(message) {
  return new ClassFeedError(message, { code: 'validation_error', status: 422 });
}

function rowToPost(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    authorUserId: row.author_user_id,
    classRoomId: row.class_room_id,
    body: row.body,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
    editedAt: row.edited_at?.toISOString?.() ?? row.edited_at,
    deletedAt: row.deleted_at?.toISOString?.() ?? row.deleted_at
  };
}

function rowToAttachment(row) {
  return {
    id: row.id,
    postId: row.post_id,
    position: row.position,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    data: row.data
  };
}

function rowToComment(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    postId: row.post_id,
    authorUserId: row.author_user_id,
    body: row.body,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    deletedAt: row.deleted_at?.toISOString?.() ?? row.deleted_at
  };
}

function validateAttachments(attachments) {
  if (!Array.isArray(attachments)) throw validationError('attachments must be an array');
  if (attachments.length > MAX_ATTACHMENTS_PER_POST) {
    throw validationError(`attachments must be at most ${MAX_ATTACHMENTS_PER_POST} items`);
  }
  attachments.forEach((att, idx) => {
    if (!att || typeof att !== 'object') throw validationError(`attachments[${idx}] invalid`);
    if (typeof att.fileName !== 'string' || att.fileName.length === 0 || att.fileName.length > 180) {
      throw validationError(`attachments[${idx}].fileName invalid`);
    }
    if (!ALLOWED_ATTACHMENT_MIMES.includes(att.mimeType)) {
      throw validationError(`attachments[${idx}].mimeType invalid`);
    }
    if (!Buffer.isBuffer(att.data) || att.data.length === 0 || att.data.length > MAX_ATTACHMENT_BYTES) {
      throw validationError(`attachments[${idx}].data invalid size`);
    }
  });
}

class PostgresClassFeedRepository {
  constructor({ pool }) {
    if (!pool) throw new Error('PostgresClassFeedRepository requires a pg pool');
    this.pool = pool;
  }

  async createPost(tenantId, author, { classRoomId, body, attachments = [] }) {
    const trimmedBody = typeof body === 'string' ? body.trim() : '';
    if (trimmedBody.length < 1 || trimmedBody.length > 5000) throw validationError('body must be 1..5000 chars');
    validateAttachments(attachments);

    const postId = `post-${crypto.randomUUID()}`;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const postResult = await client.query(
        `INSERT INTO class_feed_posts (id, tenant_id, author_user_id, class_room_id, body)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [postId, tenantId, author.userId, classRoomId ?? null, trimmedBody]
      );
      const storedAttachments = [];
      for (let i = 0; i < attachments.length; i++) {
        const att = attachments[i];
        const attId = `att-${crypto.randomUUID()}`;
        const res = await client.query(
          `INSERT INTO class_feed_post_attachments (id, post_id, position, file_name, mime_type, size_bytes, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [attId, postId, i, att.fileName.trim(), att.mimeType, att.data.length, att.data]
        );
        storedAttachments.push(rowToAttachment(res.rows[0]));
      }
      await client.query('COMMIT');
      return { ...rowToPost(postResult.rows[0]), attachments: storedAttachments };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getPost(tenantId, postId, { includeDeleted = false } = {}) {
    const result = await this.pool.query(
      `SELECT * FROM class_feed_posts WHERE id = $1 AND tenant_id = $2 ${includeDeleted ? '' : 'AND deleted_at IS NULL'}`,
      [postId, tenantId]
    );
    return rowToPost(result.rows[0]);
  }

  async listPostsForClass(tenantId, classRoomId, { limit = 20, before = null } = {}) {
    const params = [tenantId, classRoomId, limit];
    let extra = '';
    if (before) { params.push(before); extra = `AND created_at < $${params.length}`; }
    const result = await this.pool.query(
      `SELECT * FROM class_feed_posts
       WHERE tenant_id = $1 AND class_room_id = $2 AND deleted_at IS NULL ${extra}
       ORDER BY created_at DESC LIMIT $3`,
      params
    );
    return result.rows.map(rowToPost);
  }

  async getAttachment(tenantId, attachmentId) {
    const result = await this.pool.query(
      `SELECT a.* FROM class_feed_post_attachments a
       JOIN class_feed_posts p ON p.id = a.post_id
       WHERE a.id = $1 AND p.tenant_id = $2`,
      [attachmentId, tenantId]
    );
    return result.rows[0] ? rowToAttachment(result.rows[0]) : null;
  }

  async listAttachmentsForPost(tenantId, postId) {
    const post = await this.getPost(tenantId, postId);
    if (!post) return [];
    const res = await this.pool.query(
      `SELECT * FROM class_feed_post_attachments WHERE post_id = $1 ORDER BY position ASC`,
      [postId]
    );
    return res.rows.map(rowToAttachment);
  }

  async editPost(tenantId, postId, actorUserId, { body, attachments = [] }, { now }) {
    const trimmedBody = typeof body === 'string' ? body.trim() : '';
    if (trimmedBody.length < 1 || trimmedBody.length > 5000) throw validationError('body must be 1..5000 chars');
    validateAttachments(attachments);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const postRes = await client.query(
        `SELECT * FROM class_feed_posts WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [postId, tenantId]
      );
      const post = postRes.rows[0];
      if (!post) { await client.query('ROLLBACK'); return null; }
      if (post.author_user_id !== actorUserId) {
        await client.query('ROLLBACK');
        throw new ClassFeedError('Only the author can edit', { code: 'forbidden', status: 403 });
      }
      const createdAtMs = new Date(post.created_at).getTime();
      if (now - createdAtMs > EDIT_WINDOW_MS) {
        await client.query('ROLLBACK');
        throw new ClassFeedError('Edit window expired', { code: 'edit_window_expired', status: 422 });
      }

      const nowIso = new Date(now).toISOString();
      const updated = await client.query(
        `UPDATE class_feed_posts SET body = $1, updated_at = $2, edited_at = $2 WHERE id = $3 RETURNING *`,
        [trimmedBody, nowIso, postId]
      );
      await client.query('DELETE FROM class_feed_post_attachments WHERE post_id = $1', [postId]);
      for (let i = 0; i < attachments.length; i++) {
        const att = attachments[i];
        await client.query(
          `INSERT INTO class_feed_post_attachments (id, post_id, position, file_name, mime_type, size_bytes, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [`att-${crypto.randomUUID()}`, postId, i, att.fileName.trim(), att.mimeType, att.data.length, att.data]
        );
      }
      await client.query('COMMIT');
      return rowToPost(updated.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async softDeletePost(tenantId, postId, actorUserId, actorRole) {
    const result = await this.pool.query(
      `SELECT * FROM class_feed_posts WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [postId, tenantId]
    );
    const post = result.rows[0];
    if (!post) return null;
    if (post.author_user_id !== actorUserId && !POST_DELETE_ROLES.has(actorRole)) {
      throw new ClassFeedError('Forbidden', { code: 'forbidden', status: 403 });
    }
    const upd = await this.pool.query(
      `UPDATE class_feed_posts SET deleted_at = NOW() WHERE id = $1 RETURNING *`,
      [postId]
    );
    return rowToPost(upd.rows[0]);
  }

  async addComment(tenantId, postId, author, body) {
    const trimmedBody = typeof body === 'string' ? body.trim() : '';
    if (trimmedBody.length < 1 || trimmedBody.length > 2000) throw validationError('body must be 1..2000 chars');
    const post = await this.getPost(tenantId, postId);
    if (!post) return null;
    const commentId = `comment-${crypto.randomUUID()}`;
    const res = await this.pool.query(
      `INSERT INTO class_feed_post_comments (id, tenant_id, post_id, author_user_id, body)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [commentId, tenantId, postId, author.userId, trimmedBody]
    );
    return rowToComment(res.rows[0]);
  }

  async listComments(tenantId, postId) {
    const res = await this.pool.query(
      `SELECT * FROM class_feed_post_comments
       WHERE post_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [postId, tenantId]
    );
    return res.rows.map(rowToComment);
  }

  async softDeleteComment(tenantId, commentId, actorUserId, actorRole) {
    const res = await this.pool.query(
      `SELECT c.*, p.author_user_id AS post_author FROM class_feed_post_comments c
       JOIN class_feed_posts p ON p.id = c.post_id
       WHERE c.id = $1 AND c.tenant_id = $2 AND c.deleted_at IS NULL`,
      [commentId, tenantId]
    );
    const row = res.rows[0];
    if (!row) return null;
    const isAuthor = row.author_user_id === actorUserId;
    const isPostAuthor = row.post_author === actorUserId;
    const isAdmin = COMMENT_DELETE_ROLES.has(actorRole);
    if (!isAuthor && !isPostAuthor && !isAdmin) {
      throw new ClassFeedError('Forbidden', { code: 'forbidden', status: 403 });
    }
    const upd = await this.pool.query(
      `UPDATE class_feed_post_comments SET deleted_at = NOW() WHERE id = $1 RETURNING *`,
      [commentId]
    );
    return rowToComment(upd.rows[0]);
  }

  async toggleLike(tenantId, postId, userId) {
    const post = await this.getPost(tenantId, postId);
    if (!post) return null;
    const existing = await this.pool.query(
      `SELECT 1 FROM class_feed_post_likes WHERE post_id = $1 AND user_id = $2`,
      [postId, userId]
    );
    if (existing.rows.length > 0) {
      await this.pool.query(`DELETE FROM class_feed_post_likes WHERE post_id = $1 AND user_id = $2`, [postId, userId]);
      const count = await this.countLikes(tenantId, postId);
      return { liked: false, count };
    }
    await this.pool.query(
      `INSERT INTO class_feed_post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [postId, userId]
    );
    const count = await this.countLikes(tenantId, postId);
    return { liked: true, count };
  }

  async countLikes(tenantId, postId) {
    const res = await this.pool.query(
      `SELECT COUNT(*)::int AS n FROM class_feed_post_likes l
       JOIN class_feed_posts p ON p.id = l.post_id
       WHERE l.post_id = $1 AND p.tenant_id = $2`,
      [postId, tenantId]
    );
    return res.rows[0].n;
  }

  async markRead(tenantId, postId, userId) {
    const post = await this.getPost(tenantId, postId);
    if (!post) return null;
    await this.pool.query(
      `INSERT INTO class_feed_post_reads (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [postId, userId]
    );
    return { postId, userId, readAt: new Date().toISOString() };
  }

  async countReads(tenantId, postId) {
    const res = await this.pool.query(
      `SELECT COUNT(*)::int AS n FROM class_feed_post_reads r
       JOIN class_feed_posts p ON p.id = r.post_id
       WHERE r.post_id = $1 AND p.tenant_id = $2`,
      [postId, tenantId]
    );
    return res.rows[0].n;
  }

  async listReadersForPost(tenantId, postId) {
    const res = await this.pool.query(
      `SELECT r.user_id, r.read_at FROM class_feed_post_reads r
       JOIN class_feed_posts p ON p.id = r.post_id
       WHERE r.post_id = $1 AND p.tenant_id = $2 ORDER BY r.read_at ASC`,
      [postId, tenantId]
    );
    return res.rows.map((row) => ({
      postId,
      userId: row.user_id,
      readAt: row.read_at?.toISOString?.() ?? row.read_at
    }));
  }

  async resolveAudience(tenantId, post, audienceProvider) {
    let candidates;
    if (post.classRoomId === null) {
      candidates = await audienceProvider.getAllParents(tenantId);
    } else {
      candidates = await audienceProvider.getParentsForClass(tenantId, post.classRoomId);
    }
    return [...new Set(candidates)].filter((userId) => userId !== post.authorUserId);
  }
}

module.exports = { PostgresClassFeedRepository };
