const crypto = require('node:crypto');

function buildValidationError(message) {
  const error = new Error(message);
  error.code = 'VALIDATION_ERROR';
  error.status = 422;
  return error;
}

function requireString(value, fieldName, min = 1, max = 2000) {
  if (typeof value !== 'string') {
    throw buildValidationError(`${fieldName} is required`);
  }

  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw buildValidationError(`${fieldName} must be between ${min} and ${max} characters`);
  }

  return normalized;
}

function normalizeRoleList(value) {
  if (!value) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw buildValidationError('roles must be an array');
  }

  return [...new Set(value.map((role) => requireString(role, 'role', 2, 60).toLowerCase()))];
}

function normalizeIdList(value, fieldName) {
  if (!Array.isArray(value) || value.length === 0) {
    throw buildValidationError(`${fieldName} must be a non-empty array`);
  }

  return [...new Set(value.map((item) => requireString(item, fieldName, 2, 120)))];
}

class MessagingStore {
  constructor({ announcements = [], threads = [], messages = [] } = {}) {
    this.announcements = [...announcements];
    this.threads = [...threads];
    this.messages = [...messages];
  }

  createAnnouncement(tenantId, author, input) {
    const title = requireString(input.title, 'title', 3, 200);
    const body = requireString(input.body, 'body', 3, 4000);
    const visibility = input.visibility === 'roles' ? 'roles' : 'global';
    const roles = visibility === 'roles' ? normalizeRoleList(input.roles) : [];
    if (visibility === 'roles' && roles.length === 0) {
      throw buildValidationError('roles is required when visibility is roles');
    }

    const now = new Date().toISOString();
    const announcement = {
      id: `announcement-${crypto.randomUUID()}`,
      tenant_id: tenantId,
      title,
      body,
      visibility,
      roles,
      authorId: author.userId,
      authorRole: author.role,
      created_at: now,
      updated_at: now
    };

    this.announcements.push(announcement);
    return announcement;
  }

  listAnnouncementsForUser(tenantId, session) {
    return this.announcements.filter((announcement) => {
      if (announcement.tenant_id !== tenantId) {
        return false;
      }

      if (announcement.visibility === 'global') {
        return true;
      }

      return announcement.roles.includes(session.role);
    });
  }

  createThread(tenantId, creator, input) {
    const subject = requireString(input.subject, 'subject', 3, 200);
    const participantIds = normalizeIdList(input.participantIds, 'participantIds');
    const participantSet = new Set(participantIds.concat([creator.userId]));

    const now = new Date().toISOString();
    const thread = {
      id: `thread-${crypto.randomUUID()}`,
      tenant_id: tenantId,
      subject,
      participantIds: [...participantSet],
      createdByUserId: creator.userId,
      created_at: now,
      updated_at: now,
      last_message_at: now
    };
    this.threads.push(thread);

    const initialBody = requireString(input.initialMessage, 'initialMessage', 1, 4000);
    const message = {
      id: `message-${crypto.randomUUID()}`,
      tenant_id: tenantId,
      threadId: thread.id,
      senderId: creator.userId,
      body: initialBody,
      created_at: now
    };
    this.messages.push(message);

    return { thread, message };
  }

  listThreadsForUser(tenantId, userId) {
    return this.threads.filter((thread) => thread.tenant_id === tenantId && thread.participantIds.includes(userId));
  }

  getThreadForUser(tenantId, threadId, userId) {
    const thread = this.threads.find((item) => item.id === threadId && item.tenant_id === tenantId);
    if (!thread) {
      return null;
    }

    if (!thread.participantIds.includes(userId)) {
      return 'forbidden';
    }

    const messages = this.messages
      .filter((item) => item.tenant_id === tenantId && item.threadId === threadId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    return { ...thread, messages };
  }

  addMessage(tenantId, threadId, senderId, input) {
    const thread = this.threads.find((item) => item.id === threadId && item.tenant_id === tenantId);
    if (!thread) {
      return null;
    }

    if (!thread.participantIds.includes(senderId)) {
      return 'forbidden';
    }

    const now = new Date().toISOString();
    const message = {
      id: `message-${crypto.randomUUID()}`,
      tenant_id: tenantId,
      threadId,
      senderId,
      body: requireString(input.body, 'body', 1, 4000),
      created_at: now
    };

    this.messages.push(message);
    thread.updated_at = now;
    thread.last_message_at = now;
    return message;
  }

  getInbox(tenantId, session) {
    const announcements = this.listAnnouncementsForUser(tenantId, session);
    const threads = this.listThreadsForUser(tenantId, session.userId).map((thread) => ({
      ...thread,
      messageCount: this.messages.filter((item) => item.tenant_id === tenantId && item.threadId === thread.id).length
    }));

    return {
      announcements: announcements.sort((a, b) => b.created_at.localeCompare(a.created_at)),
      threads: threads.sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))
    };
  }
}

module.exports = {
  MessagingStore,
  buildValidationError
};
