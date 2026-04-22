const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AiService,
  PromptRegistry,
  TenantAiFeatureFlagStore,
  AiProviderRegistry,
  AiLogStore,
  DevEchoAiProvider
} = require('./ai');

test('un appel IA passe par l’abstraction serveur et enregistre un log minimal', async () => {
  const logStore = new AiLogStore();
  const provider = {
    called: false,
    async generate() {
      this.called = true;
      return { outputText: 'ok', finishReason: 'stop' };
    }
  };

  const service = new AiService({
    featureFlags: new TenantAiFeatureFlagStore({ tenantFlags: { 'school-a': true } }),
    promptRegistry: new PromptRegistry({ prompts: [{ key: 'assistant.summary', version: 1, template: 'résume' }] }),
    providerRegistry: new AiProviderRegistry({ providers: { stub: provider }, defaultProvider: 'stub' }),
    logStore
  });

  const result = await service.execute({
    tenantId: 'school-a',
    actorUserId: 'teacher-a1',
    promptKey: 'assistant.summary',
    input: 'Texte confidentiel'
  });

  assert.equal(provider.called, true);
  assert.equal(result.outputText, 'ok');

  const [log] = logStore.listByTenant('school-a');
  assert.equal(log.status, 'success');
  assert.equal(log.promptKey, 'assistant.summary');
  assert.equal(log.promptVersion, 1);
  assert.equal(log.actorUserId, 'teacher-a1');
  assert.equal(log.provider, 'stub');
  assert.equal(log.metadata.inputLength, 'Texte confidentiel'.length);
  assert.equal(log.metadata.outputLength, 2);
  assert.equal(log.metadata.rawInput, undefined);
});

test('le provider peut être remplacé/mocké sans changer le service', async () => {
  const mockProvider = {
    async generate({ prompt }) {
      return { outputText: `MOCK:${prompt.version}` };
    }
  };

  const service = new AiService({
    featureFlags: new TenantAiFeatureFlagStore({ tenantFlags: { 'school-a': true } }),
    promptRegistry: new PromptRegistry({ prompts: [{ key: 'assistant.summary', version: 1, template: 'v1' }] }),
    providerRegistry: new AiProviderRegistry({ providers: { mock: mockProvider }, defaultProvider: 'mock' }),
    logStore: new AiLogStore()
  });

  const result = await service.execute({ tenantId: 'school-a', promptKey: 'assistant.summary', input: 'abc' });
  assert.equal(result.outputText, 'MOCK:1');
  assert.equal(result.provider, 'mock');
});

test('un tenant avec IA désactivée est refusé proprement', async () => {
  const service = new AiService({
    featureFlags: new TenantAiFeatureFlagStore({ tenantFlags: { 'school-a': false } }),
    promptRegistry: new PromptRegistry({ prompts: [{ key: 'assistant.summary', version: 1, template: 'v1' }] }),
    providerRegistry: new AiProviderRegistry({ providers: { 'dev-echo': new DevEchoAiProvider() }, defaultProvider: 'dev-echo' }),
    logStore: new AiLogStore()
  });

  await assert.rejects(
    () => service.execute({ tenantId: 'school-a', promptKey: 'assistant.summary', input: 'abc' }),
    (error) => error.code === 'AI_DISABLED' && error.status === 403
  );
});

test('les prompts sont résolus via une structure versionnée', async () => {
  const promptRegistry = new PromptRegistry({
    prompts: [
      { key: 'assistant.summary', version: 1, template: 'v1' },
      { key: 'assistant.summary', version: 3, template: 'v3' },
      { key: 'assistant.summary', version: 2, template: 'v2' }
    ]
  });

  const latest = promptRegistry.resolve('assistant.summary');
  const v1 = promptRegistry.resolve('assistant.summary', 1);

  assert.equal(latest.version, 3);
  assert.equal(v1.template, 'v1');
});

test('l’isolation tenant est respectée pour les feature flags IA', async () => {
  const provider = new DevEchoAiProvider();
  const service = new AiService({
    featureFlags: new TenantAiFeatureFlagStore({ tenantFlags: { 'school-a': true, 'school-b': false } }),
    promptRegistry: new PromptRegistry({ prompts: [{ key: 'assistant.summary', version: 1, template: 'v1' }] }),
    providerRegistry: new AiProviderRegistry({ providers: { dev: provider }, defaultProvider: 'dev' }),
    logStore: new AiLogStore()
  });

  const allowed = await service.execute({ tenantId: 'school-a', promptKey: 'assistant.summary', input: 'ok' });
  assert.match(allowed.outputText, /dev-echo/);

  await assert.rejects(
    () => service.execute({ tenantId: 'school-b', promptKey: 'assistant.summary', input: 'ko' }),
    (error) => error.code === 'AI_DISABLED'
  );
});
