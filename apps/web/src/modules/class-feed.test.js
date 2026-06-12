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
