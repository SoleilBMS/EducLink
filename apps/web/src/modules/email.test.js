const test = require('node:test');
const assert = require('node:assert/strict');

const { EmailService, EmailServiceError } = require('./email');

function makeLogger() {
  const calls = [];
  return {
    info: (msg, meta) => calls.push({ level: 'info', msg, meta }),
    warn: (msg, meta) => calls.push({ level: 'warn', msg, meta }),
    error: (msg, meta) => calls.push({ level: 'error', msg, meta }),
    calls
  };
}

test('EmailService: no-op mode quand apiKey est null', async () => {
  const logger = makeLogger();
  const fetchCalls = [];
  const service = new EmailService({
    apiKey: null,
    fromAddress: 'noreply@test.com',
    logger,
    fetch: async (...args) => { fetchCalls.push(args); return new Response('{}'); }
  });

  const result = await service.send({ to: 'parent@test.com', subject: 'Hi', html: '<p>x</p>', text: 'x' });
  assert.equal(result.skipped, true);
  assert.equal(fetchCalls.length, 0);
  assert.ok(logger.calls.some(c => c.level === 'info' && c.msg.includes('no-op')));
});

test('EmailService: send() POSTe vers Resend API avec Authorization Bearer', async () => {
  const logger = makeLogger();
  const fetchCalls = [];
  const service = new EmailService({
    apiKey: 're_test_123',
    fromAddress: 'noreply@test.com',
    fromName: 'TestApp',
    logger,
    fetch: async (url, opts) => {
      fetchCalls.push({ url, opts });
      return new Response(JSON.stringify({ id: 'email_abc' }), { status: 200 });
    }
  });

  const result = await service.send({
    to: 'parent@test.com',
    subject: 'Hi',
    html: '<p>x</p>',
    text: 'x'
  });

  assert.equal(result.id, 'email_abc');
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://api.resend.com/emails');
  assert.equal(fetchCalls[0].opts.headers['Authorization'], 'Bearer re_test_123');
  const body = JSON.parse(fetchCalls[0].opts.body);
  assert.equal(body.from, 'TestApp <noreply@test.com>');
  assert.deepEqual(body.to, ['parent@test.com']);
  assert.equal(body.subject, 'Hi');
});

test('EmailService: send() throw EmailServiceError sur erreur HTTP 4xx', async () => {
  const service = new EmailService({
    apiKey: 're_test_123',
    fromAddress: 'noreply@test.com',
    logger: makeLogger(),
    fetch: async () => new Response(JSON.stringify({ message: 'Invalid email' }), { status: 422 })
  });

  await assert.rejects(
    () => service.send({ to: 'bad', subject: 'x', html: 'x', text: 'x' }),
    (err) => err instanceof EmailServiceError && err.status === 422
  );
});

test('EmailService: sendBatch() loop sur recipients et compte succes/echecs', async () => {
  let callCount = 0;
  const service = new EmailService({
    apiKey: 're_test_123',
    fromAddress: 'noreply@test.com',
    logger: makeLogger(),
    fetch: async () => {
      callCount += 1;
      if (callCount === 2) {
        return new Response(JSON.stringify({ message: 'Bad' }), { status: 422 });
      }
      return new Response(JSON.stringify({ id: `email_${callCount}` }), { status: 200 });
    }
  });

  const result = await service.sendBatch({
    recipients: ['a@x.com', 'b@x.com', 'c@x.com'],
    subject: 'x', html: 'x', text: 'x'
  });

  assert.equal(result.sent, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].recipient, 'b@x.com');
});

test('EmailServiceError contient status et code', () => {
  const err = new EmailServiceError('Boom', { status: 500, code: 'server_error' });
  assert.equal(err.status, 500);
  assert.equal(err.code, 'server_error');
  assert.equal(err.message, 'Boom');
});
