const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');

const { parseMultipart } = require('./multipart');

const BOUNDARY = '----EducLinkTestBoundary12345';
const CRLF = '\r\n';

function buildBody(parts) {
  const buffers = [];
  for (const part of parts) {
    buffers.push(Buffer.from(`--${BOUNDARY}${CRLF}`));
    if (part.kind === 'field') {
      buffers.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"${CRLF}${CRLF}`));
      buffers.push(Buffer.from(`${part.value}${CRLF}`));
    } else if (part.kind === 'file') {
      buffers.push(Buffer.from(
        `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"${CRLF}` +
        `Content-Type: ${part.mimeType}${CRLF}${CRLF}`
      ));
      buffers.push(part.data);
      buffers.push(Buffer.from(CRLF));
    }
  }
  buffers.push(Buffer.from(`--${BOUNDARY}--${CRLF}`));
  return Buffer.concat(buffers);
}

function makeRequest(body, headers = {}) {
  const stream = new PassThrough();
  stream.headers = {
    'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
    'content-length': String(body.length),
    ...headers
  };
  setImmediate(() => {
    stream.end(body);
  });
  return stream;
}

test('parseMultipart : parse 1 fichier + champs texte', async () => {
  const body = buildBody([
    { kind: 'field', name: 'reason', value: 'maladie' },
    { kind: 'field', name: 'comment', value: 'angine' },
    { kind: 'file', name: 'document', filename: 'certif.pdf', mimeType: 'application/pdf', data: Buffer.from('%PDF-1.4 hello') }
  ]);
  const request = makeRequest(body);
  const { fields, file } = await parseMultipart(request, {
    allowedMimeTypes: ['application/pdf', 'image/png']
  });
  assert.equal(fields.get('reason'), 'maladie');
  assert.equal(fields.get('comment'), 'angine');
  assert.ok(file);
  assert.equal(file.fileName, 'certif.pdf');
  assert.equal(file.mimeType, 'application/pdf');
  assert.equal(file.size, 14);
  assert.equal(file.data.toString('utf8'), '%PDF-1.4 hello');
});

test('parseMultipart : retourne file=null si aucun fichier joint', async () => {
  const body = buildBody([
    { kind: 'field', name: 'reason', value: 'autre' }
  ]);
  const request = makeRequest(body);
  const { fields, file } = await parseMultipart(request);
  assert.equal(fields.get('reason'), 'autre');
  assert.equal(file, null);
});

test('parseMultipart : rejette si Content-Type pas multipart', async () => {
  const stream = new PassThrough();
  stream.headers = { 'content-type': 'application/json' };
  setImmediate(() => stream.end(Buffer.from('{}')));
  await assert.rejects(parseMultipart(stream), /Content-Type must be multipart/);
});

test('parseMultipart : rejette un fichier dépassant maxFileSize', async () => {
  const body = buildBody([
    { kind: 'file', name: 'document', filename: 'big.pdf', mimeType: 'application/pdf', data: Buffer.alloc(2048, 0xff) }
  ]);
  const request = makeRequest(body);
  await assert.rejects(
    parseMultipart(request, { maxFileSize: 512, allowedMimeTypes: ['application/pdf'] }),
    /File too large/
  );
});

test('parseMultipart : rejette un MIME interdit', async () => {
  const body = buildBody([
    { kind: 'file', name: 'document', filename: 'page.html', mimeType: 'text/html', data: Buffer.from('<html></html>') }
  ]);
  const request = makeRequest(body);
  await assert.rejects(
    parseMultipart(request, { allowedMimeTypes: ['application/pdf'] }),
    /mime type "text\/html" not allowed/
  );
});

test('parseMultipart : rejette > 1 fichier', async () => {
  const body = buildBody([
    { kind: 'file', name: 'doc1', filename: 'a.pdf', mimeType: 'application/pdf', data: Buffer.from('A') },
    { kind: 'file', name: 'doc2', filename: 'b.pdf', mimeType: 'application/pdf', data: Buffer.from('B') }
  ]);
  const request = makeRequest(body);
  await assert.rejects(
    parseMultipart(request, { allowedMimeTypes: ['application/pdf'] }),
    /Too many files/
  );
});
