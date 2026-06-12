const test = require('node:test');
const assert = require('node:assert/strict');
const { renderNewPostEmail } = require('./email-new-post');

test('renderNewPostEmail: cas classe normale', () => {
  const result = renderNewPostEmail({
    post: { id: 'post-1', body: 'Sortie au musee !', classRoomId: 'class-cp-b' },
    author: { name: 'Sophie Diallo' },
    className: 'CP-B',
    baseUrl: 'https://app.educlink.example',
    recipientName: 'Marie Bouchet'
  });
  assert.match(result.subject, /Nouveau post de Sophie Diallo dans CP-B/);
  assert.match(result.html, /Sortie au musee/);
  assert.match(result.html, /https:\/\/app\.educlink\.example\/class-feed\/classes\/class-cp-b#post-post-1/);
  assert.match(result.text, /Sophie Diallo/);
  assert.match(result.text, /Sortie au musee/);
});

test('renderNewPostEmail: cas broadcast (classRoomId null)', () => {
  const result = renderNewPostEmail({
    post: { id: 'post-2', body: 'Annonce ecole', classRoomId: null },
    author: { name: 'Mme la Directrice' },
    className: null,
    baseUrl: 'https://app.educlink.example',
    recipientName: 'Parent'
  });
  assert.match(result.subject, /Annonce de l'ecole/);
  assert.match(result.html, /Annonce ecole/);
});

test('renderNewPostEmail: tronque le body a 200 chars + ellipsis', () => {
  const longBody = 'x'.repeat(500);
  const result = renderNewPostEmail({
    post: { id: 'p', body: longBody, classRoomId: 'c1' },
    author: { name: 'Auteur' },
    className: 'Classe',
    baseUrl: 'https://x.com',
    recipientName: 'R'
  });
  assert.ok(result.html.includes('x'.repeat(200) + '…'));
  assert.equal(result.html.includes('x'.repeat(201)), false);
});
