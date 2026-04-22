const crypto = require('node:crypto');

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || typeof value === 'function') {
      continue;
    }

    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value;
    }
  }

  return Object.keys(sanitized).length ? sanitized : null;
}

class AuditLogStore {
  constructor({ logs = [] } = {}) {
    this.logs = [...logs];
  }

  write(event) {
    const timestamp = new Date().toISOString();
    const log = {
      id: `audit-${crypto.randomUUID()}`,
      tenantId: event.tenantId,
      actorUserId: event.actorUserId || 'system',
      actorRole: event.actorRole || 'system',
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId || null,
      timestamp,
      metadata: sanitizeMetadata(event.metadata)
    };
    this.logs.push(log);
    return log;
  }

  listByTenant(tenantId, { action, targetType, actorUserId, limit = 100 } = {}) {
    const normalizedLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    return this.logs
      .filter((item) => {
        if (item.tenantId !== tenantId) {
          return false;
        }
        if (action && item.action !== action) {
          return false;
        }
        if (targetType && item.targetType !== targetType) {
          return false;
        }
        if (actorUserId && item.actorUserId !== actorUserId) {
          return false;
        }
        return true;
      })
      .slice()
      .reverse()
      .slice(0, normalizedLimit);
  }
}

function createAuditEventWriter({ auditLogStore }) {
  function writeCriticalEvent(session, event) {
    if (!session?.tenantId) {
      return null;
    }
    return auditLogStore.write({
      tenantId: session.tenantId,
      actorUserId: session.userId,
      actorRole: session.role,
      ...event
    });
  }

  return {
    writeAuthEvent(session, action, metadata) {
      return writeCriticalEvent(session, {
        action,
        targetType: 'auth',
        targetId: session?.userId ?? null,
        metadata
      });
    },
    writeEntityEvent(session, action, targetType, targetId, metadata) {
      return writeCriticalEvent(session, { action, targetType, targetId, metadata });
    },
    writeSensitiveDataAccess(session, targetType, targetId, metadata) {
      return writeCriticalEvent(session, {
        action: 'sensitive_data.access',
        targetType,
        targetId,
        metadata
      });
    },
    writeFinanceEvent(session, action, targetId, metadata) {
      return writeCriticalEvent(session, {
        action,
        targetType: 'finance',
        targetId,
        metadata
      });
    },
    writeAiEvent(session, action, targetId, metadata) {
      return writeCriticalEvent(session, {
        action,
        targetType: 'ai_generation',
        targetId,
        metadata
      });
    }
  };
}

module.exports = {
  AuditLogStore,
  createAuditEventWriter
};
