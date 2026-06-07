const test = require('node:test');
const assert = require('node:assert/strict');

const { generateCsrfToken, compareCsrfTokens } = require('./csrf');

test('generateCsrfToken produit un hex de 64 caractères (32 octets)', () => {
  const token = generateCsrfToken();
  assert.equal(typeof token, 'string');
  assert.equal(token.length, 64);
  assert.match(token, /^[0-9a-f]+$/);
});

test('generateCsrfToken renvoie des tokens distincts à chaque appel', () => {
  const a = generateCsrfToken();
  const b = generateCsrfToken();
  assert.notEqual(a, b);
});

test('compareCsrfTokens renvoie true pour des tokens identiques', () => {
  const token = generateCsrfToken();
  assert.equal(compareCsrfTokens(token, token), true);
});

test('compareCsrfTokens renvoie false pour des tokens différents de même longueur', () => {
  const a = generateCsrfToken();
  const b = generateCsrfToken();
  assert.equal(compareCsrfTokens(a, b), false);
});

test('compareCsrfTokens refuse les types non-string et les chaînes vides', () => {
  assert.equal(compareCsrfTokens('', 'abc'), false);
  assert.equal(compareCsrfTokens('abc', ''), false);
  assert.equal(compareCsrfTokens(null, 'abc'), false);
  assert.equal(compareCsrfTokens('abc', undefined), false);
  assert.equal(compareCsrfTokens(123, 'abc'), false);
});

test('compareCsrfTokens refuse les tokens de longueurs différentes', () => {
  assert.equal(compareCsrfTokens('abc', 'abcd'), false);
});
