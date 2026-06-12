const test = require('node:test');
const assert = require('node:assert/strict');

const { ClassFeedStore, ClassFeedError } = require('./class-feed');

function makeAuthor(overrides = {}) {
  return { userId: 'teacher-a1', role: 'teacher', tenantId: 'school-a', ...overrides };
}

test('ClassFeedStore.createPost: cree un post avec body et classRoomId', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', makeAuthor(), {
    classRoomId: 'class-cp-b',
    body: 'Sortie au musee hier !',
    attachments: []
  });
  assert.equal(typeof post.id, 'string');
  assert.equal(post.tenantId, 'school-a');
  assert.equal(post.authorUserId, 'teacher-a1');
  assert.equal(post.classRoomId, 'class-cp-b');
  assert.equal(post.body, 'Sortie au musee hier !');
  assert.equal(post.deletedAt, null);
  assert.equal(post.editedAt, null);
});

test('ClassFeedStore.createPost: classRoomId null = broadcast', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', makeAuthor({ role: 'school_admin' }), {
    classRoomId: null,
    body: 'Annonce ecole',
    attachments: []
  });
  assert.equal(post.classRoomId, null);
});

test('ClassFeedStore.createPost: rejette body vide', () => {
  const store = new ClassFeedStore();
  assert.throws(
    () => store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: '', attachments: [] }),
    (err) => err instanceof ClassFeedError && err.code === 'validation_error'
  );
});

test('ClassFeedStore.createPost: rejette body > 5000 chars', () => {
  const store = new ClassFeedStore();
  assert.throws(
    () => store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'x'.repeat(5001), attachments: [] }),
    (err) => err instanceof ClassFeedError && err.code === 'validation_error'
  );
});

test('ClassFeedStore.getPost: retrieve un post existant, null si inexistant', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'Hi', attachments: [] });

  const found = store.getPost('school-a', post.id);
  assert.equal(found.id, post.id);

  const missing = store.getPost('school-a', 'nope');
  assert.equal(missing, null);
});

test('ClassFeedStore.getPost: cross-tenant retourne null', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'Hi', attachments: [] });
  const result = store.getPost('school-b', post.id);
  assert.equal(result, null);
});

test('ClassFeedStore.listPostsForClass: ordonne par created_at DESC + limit', () => {
  let t = 1000;
  const store = new ClassFeedStore({ clock: () => (t += 100) });
  store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'first', attachments: [] });
  store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'second', attachments: [] });
  store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'third', attachments: [] });

  const posts = store.listPostsForClass('school-a', 'class-cp-b', { limit: 2 });
  assert.equal(posts.length, 2);
  assert.equal(posts[0].body, 'third');
  assert.equal(posts[1].body, 'second');
});

test('ClassFeedStore.listPostsForClass: filtre par classRoomId', () => {
  const store = new ClassFeedStore();
  store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'in cp-b', attachments: [] });
  store.createPost('school-a', makeAuthor(), { classRoomId: 'class-ce1-a', body: 'in ce1-a', attachments: [] });

  const posts = store.listPostsForClass('school-a', 'class-cp-b', { limit: 10 });
  assert.equal(posts.length, 1);
  assert.equal(posts[0].body, 'in cp-b');
});

const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 3 * 1024 * 1024;

function makeAttachment(overrides = {}) {
  return {
    fileName: 'photo.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
    data: Buffer.from('fake'),
    ...overrides
  };
}

test('ClassFeedStore.createPost: accepte jusqu\'a 8 attachments', () => {
  const store = new ClassFeedStore();
  const attachments = Array.from({ length: 8 }, (_, i) => makeAttachment({ fileName: `p${i}.jpg` }));
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'with photos', attachments });
  assert.equal(post.attachments.length, 8);
  post.attachments.forEach((a, i) => assert.equal(a.position, i));
});

test('ClassFeedStore.createPost: rejette > 8 attachments', () => {
  const store = new ClassFeedStore();
  const attachments = Array.from({ length: 9 }, () => makeAttachment());
  assert.throws(() => store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'too many', attachments }),
    (err) => err.code === 'validation_error');
});

test('ClassFeedStore.createPost: rejette mimeType non autorise', () => {
  const store = new ClassFeedStore();
  assert.throws(() => store.createPost('school-a', makeAuthor(), {
    classRoomId: 'class-cp-b', body: 'bad mime',
    attachments: [makeAttachment({ mimeType: 'application/pdf' })]
  }), (err) => err.code === 'validation_error');
});

test('ClassFeedStore.createPost: rejette attachment > 3 Mo', () => {
  const store = new ClassFeedStore();
  assert.throws(() => store.createPost('school-a', makeAuthor(), {
    classRoomId: 'class-cp-b', body: 'too big',
    attachments: [makeAttachment({ sizeBytes: 3 * 1024 * 1024 + 1, data: Buffer.alloc(3 * 1024 * 1024 + 1) })]
  }), (err) => err.code === 'validation_error');
});

test('ClassFeedStore.getAttachment: retourne data par id, null cross-tenant', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', makeAuthor(), {
    classRoomId: 'class-cp-b', body: 'x',
    attachments: [makeAttachment({ fileName: 'photo.jpg' })]
  });
  const att = store.getAttachment('school-a', post.attachments[0].id);
  assert.equal(att.fileName, 'photo.jpg');
  assert.ok(Buffer.isBuffer(att.data));
  assert.equal(store.getAttachment('school-b', post.attachments[0].id), null);
});

test('ClassFeedStore.editPost: succes si auteur ET < 1h', () => {
  let now = 1_700_000_000_000;
  const store = new ClassFeedStore({ clock: () => now });
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'original', attachments: [] });
  now += 30 * 60 * 1000;
  const edited = store.editPost('school-a', post.id, 'teacher-a1', { body: 'updated', attachments: [] }, { now });
  assert.equal(edited.body, 'updated');
  assert.ok(edited.editedAt);
});

test('ClassFeedStore.editPost: refuse si > 1h', () => {
  let now = 1_700_000_000_000;
  const store = new ClassFeedStore({ clock: () => now });
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'original', attachments: [] });
  now += 61 * 60 * 1000;
  assert.throws(() => store.editPost('school-a', post.id, 'teacher-a1', { body: 'updated', attachments: [] }, { now }),
    (err) => err.code === 'edit_window_expired');
});

test('ClassFeedStore.editPost: refuse si pas auteur', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'x', attachments: [] });
  assert.throws(() => store.editPost('school-a', post.id, 'teacher-other', { body: 'y', attachments: [] }, { now: Date.now() }),
    (err) => err.code === 'forbidden');
});

test('ClassFeedStore.softDeletePost: auteur OK', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'x', attachments: [] });
  store.softDeletePost('school-a', post.id, 'teacher-a1', 'teacher');
  assert.equal(store.getPost('school-a', post.id), null);
  assert.ok(store.getPost('school-a', post.id, { includeDeleted: true }).deletedAt);
});

test('ClassFeedStore.softDeletePost: admin OK meme si pas auteur', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'x', attachments: [] });
  store.softDeletePost('school-a', post.id, 'admin-a', 'school_admin');
  assert.equal(store.getPost('school-a', post.id), null);
});

test('ClassFeedStore.softDeletePost: parent refuse', () => {
  const store = new ClassFeedStore();
  const post = store.createPost('school-a', makeAuthor(), { classRoomId: 'class-cp-b', body: 'x', attachments: [] });
  assert.throws(() => store.softDeletePost('school-a', post.id, 'parent-a1', 'parent'),
    (err) => err.code === 'forbidden');
});
