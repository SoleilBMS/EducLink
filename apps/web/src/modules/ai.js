const crypto = require('node:crypto');

function buildAiError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

class PromptRegistry {
  constructor({ prompts = [] } = {}) {
    this.promptsByKey = new Map();

    for (const prompt of prompts) {
      this.register(prompt);
    }
  }

  register(prompt) {
    if (!prompt || typeof prompt !== 'object') {
      throw buildAiError(500, 'AI_PROMPT_INVALID', 'Prompt definition must be an object');
    }

    const key = String(prompt.key || '').trim();
    const version = Number(prompt.version);
    const template = String(prompt.template || '').trim();

    if (!key || !Number.isInteger(version) || version <= 0 || !template) {
      throw buildAiError(500, 'AI_PROMPT_INVALID', 'Prompt definition requires key, positive integer version and template');
    }

    const byVersion = this.promptsByKey.get(key) ?? new Map();
    byVersion.set(version, { key, version, template, metadata: prompt.metadata || null });
    this.promptsByKey.set(key, byVersion);
  }

  resolve(key, version = null) {
    const normalizedKey = String(key || '').trim();
    const byVersion = this.promptsByKey.get(normalizedKey);

    if (!byVersion) {
      throw buildAiError(500, 'AI_PROMPT_NOT_FOUND', `Prompt key not found: ${normalizedKey}`);
    }

    if (version !== null && version !== undefined) {
      const prompt = byVersion.get(Number(version));
      if (!prompt) {
        throw buildAiError(500, 'AI_PROMPT_NOT_FOUND', `Prompt version not found: ${normalizedKey}@${version}`);
      }
      return prompt;
    }

    const latestVersion = Math.max(...byVersion.keys());
    return byVersion.get(latestVersion);
  }
}

class TenantAiFeatureFlagStore {
  constructor({ tenantFlags = {} } = {}) {
    this.tenantFlags = new Map(Object.entries(tenantFlags));
  }

  isEnabled(tenantId) {
    if (!tenantId) {
      return false;
    }

    return Boolean(this.tenantFlags.get(tenantId));
  }

  setTenantEnabled(tenantId, enabled) {
    this.tenantFlags.set(tenantId, Boolean(enabled));
  }
}

class AiProviderRegistry {
  constructor({ providers = {}, defaultProvider = null } = {}) {
    this.providers = new Map(Object.entries(providers));
    this.defaultProvider = defaultProvider;
  }

  register(name, provider) {
    this.providers.set(name, provider);
  }

  get(name = this.defaultProvider) {
    const provider = this.providers.get(name);
    if (!provider || typeof provider.generate !== 'function') {
      throw buildAiError(500, 'AI_PROVIDER_NOT_CONFIGURED', `AI provider not configured: ${name}`);
    }

    return { name, provider };
  }
}

class DevEchoAiProvider {
  async generate({ prompt, input }) {
    return {
      outputText: `[dev-echo] ${prompt.template} :: ${String(input || '').trim()}`.trim(),
      finishReason: 'stop',
      usage: { inputTokens: 0, outputTokens: 0 }
    };
  }
}

class AiLogStore {
  constructor({ logs = [] } = {}) {
    this.logs = [...logs];
  }

  record(event) {
    const log = {
      id: `ai-log-${crypto.randomUUID()}`,
      tenantId: event.tenantId,
      actorUserId: event.actorUserId || null,
      promptKey: event.promptKey,
      promptVersion: event.promptVersion,
      provider: event.provider,
      timestamp: event.timestamp || new Date().toISOString(),
      status: event.status,
      metadata: sanitizeMetadata(event.metadata)
    };

    this.logs.push(log);
    return log;
  }

  listByTenant(tenantId) {
    return this.logs.filter((item) => item.tenantId === tenantId);
  }
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || typeof value === 'function') {
      continue;
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
      sanitized[key] = value;
    }
  }

  return Object.keys(sanitized).length ? sanitized : null;
}

class AiService {
  constructor({ featureFlags, promptRegistry, providerRegistry, logStore }) {
    this.featureFlags = featureFlags;
    this.promptRegistry = promptRegistry;
    this.providerRegistry = providerRegistry;
    this.logStore = logStore;
  }

  async execute(request) {
    const { tenantId, actorUserId = null, promptKey, promptVersion = null, input, providerName = null } = request;

    if (!this.featureFlags.isEnabled(tenantId)) {
      throw buildAiError(403, 'AI_DISABLED', 'AI assistant features are disabled for this tenant');
    }

    const prompt = this.promptRegistry.resolve(promptKey, promptVersion);
    const { name: providerUsed, provider } = this.providerRegistry.get(providerName || undefined);

    const timestamp = new Date().toISOString();

    try {
      const response = await provider.generate({ prompt, input, tenantId, actorUserId });
      this.logStore.record({
        tenantId,
        actorUserId,
        promptKey: prompt.key,
        promptVersion: prompt.version,
        provider: providerUsed,
        timestamp,
        status: 'success',
        metadata: {
          inputLength: String(input || '').length,
          outputLength: String(response?.outputText || '').length,
          finishReason: response?.finishReason || null
        }
      });

      return {
        prompt,
        provider: providerUsed,
        outputText: response.outputText,
        finishReason: response.finishReason || 'stop',
        usage: response.usage || null
      };
    } catch (error) {
      this.logStore.record({
        tenantId,
        actorUserId,
        promptKey: prompt.key,
        promptVersion: prompt.version,
        provider: providerUsed,
        timestamp,
        status: 'error',
        metadata: {
          errorCode: error.code || 'AI_PROVIDER_ERROR',
          errorMessage: String(error.message || 'Provider request failed').slice(0, 200)
        }
      });
      throw error;
    }
  }
}

module.exports = {
  AiService,
  PromptRegistry,
  TenantAiFeatureFlagStore,
  AiProviderRegistry,
  AiLogStore,
  DevEchoAiProvider,
  buildAiError
};
