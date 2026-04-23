const REDACTED = '[REDACTED]';

const SENSITIVE_FIELD_NAMES = new Set(['password', 'token', 'authorization', 'cookie', 'secret', 'apiKey']);
const LEVEL_PRIORITIES = { debug: 10, info: 20, warn: 30, error: 40 };

function normalizeLevel(level) {
  const normalized = String(level || 'info').toLowerCase();
  return LEVEL_PRIORITIES[normalized] ? normalized : 'info';
}

function shouldLog(level, minLevel) {
  return LEVEL_PRIORITIES[level] >= LEVEL_PRIORITIES[minLevel];
}

function sanitizeContext(value, key = '') {
  if (value === undefined || typeof value === 'function') {
    return undefined;
  }

  if (SENSITIVE_FIELD_NAMES.has(String(key))) {
    return REDACTED;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeContext(item)).filter((item) => item !== undefined);
  }

  if (value && typeof value === 'object') {
    const sanitized = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      const normalizedValue = sanitizeContext(entryValue, entryKey);
      if (normalizedValue !== undefined) {
        sanitized[entryKey] = normalizedValue;
      }
    }
    return sanitized;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }

  return String(value);
}

function formatLogLine(entry, format) {
  if (format === 'pretty') {
    const { timestamp, level, message, module, ...context } = entry;
    const contextString = Object.keys(context).length ? ` ${JSON.stringify(context)}` : '';
    return `${timestamp} ${level.toUpperCase()} [${module}] ${message}${contextString}`;
  }

  return JSON.stringify(entry);
}

function createLogger({
  module = 'app',
  level = process.env.LOG_LEVEL || 'info',
  format = process.env.LOG_FORMAT || (process.env.NODE_ENV === 'production' ? 'json' : 'pretty'),
  clock = () => new Date().toISOString(),
  sink = (line) => console.log(line),
  context = {}
} = {}) {
  const minLevel = normalizeLevel(level);
  const baseContext = sanitizeContext(context) || {};

  function write(entryLevel, message, extraContext = {}) {
    const normalizedLevel = normalizeLevel(entryLevel);
    if (!shouldLog(normalizedLevel, minLevel)) {
      return;
    }

    const logEntry = {
      timestamp: clock(),
      level: normalizedLevel,
      message: String(message || ''),
      module,
      ...baseContext,
      ...(sanitizeContext(extraContext) || {})
    };

    sink(formatLogLine(logEntry, format), logEntry);
  }

  return {
    child(childContext = {}, childModule = module) {
      return createLogger({
        module: childModule,
        level: minLevel,
        format,
        clock,
        sink,
        context: { ...baseContext, ...(sanitizeContext(childContext) || {}) }
      });
    },
    debug(message, extraContext) {
      write('debug', message, extraContext);
    },
    info(message, extraContext) {
      write('info', message, extraContext);
    },
    warn(message, extraContext) {
      write('warn', message, extraContext);
    },
    error(message, extraContext) {
      write('error', message, extraContext);
    }
  };
}

module.exports = {
  createLogger,
  sanitizeContext
};
