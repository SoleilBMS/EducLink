const test = require('node:test');
const assert = require('node:assert/strict');

const {
  InMemoryUserStore,
  DuplicateEmailError,
  buildSeedUsersWithHashedPassword,
  normalizeEmail
} = require('./user-store');

function seedStore() {
  const users = buildSeedUsersWithHashedPassword({
    users: [
      { id: 'u-admin-a', email: 'admin@school-a.test', role: 'school_admin', tenantId: 'school-a' },
      { id: 'u-teacher-a', email: 'teacher@school-a.test', role: 'teacher', tenantId: 'school-a' },
      { id: 'u-admin-b', email: 'admin@school-b.test', role: 'school_admin', tenantId: 'school-b' },
      { id: 'u-super', email: 'super@platform.test', role: 'super_admin', tenantId: null }
    ],
    plainPassword: 'password123'
  });
  return new InMemoryUserStore({ users });
}

test('findByEmail est insensible à la casse et au whitespace', async () => {
  const store = seedStore();
  const found = await store.findByEmail('  Admin@School-A.test ');
  assert.equal(found?.id, 'u-admin-a');
});

test('findByEmail renvoie null pour un user inactif', async () => {
  const store = seedStore();
  await store.update('u-teacher-a', { isActive: false });
  assert.equal(await store.findByEmail('teacher@school-a.test'), null);
});

test('create insère un nouvel utilisateur retrouvé via findByEmail', async () => {
  const store = seedStore();
  await store.create({
    id: 'u-new',
    tenantId: 'school-a',
    email: 'Nouveau@School-A.test',
    role: 'parent',
    passwordHash: 'hash'
  });
  const found = await store.findByEmail('nouveau@school-a.test');
  assert.equal(found?.id, 'u-new');
  assert.equal(found?.role, 'parent');
});

test('create rejette les emails déjà utilisés (insensible à la casse)', async () => {
  const store = seedStore();
  await assert.rejects(
    () => store.create({
      id: 'u-dup',
      tenantId: 'school-a',
      email: 'ADMIN@school-a.test',
      role: 'teacher',
      passwordHash: 'hash'
    }),
    (err) => err instanceof DuplicateEmailError && err.code === 'DUPLICATE_EMAIL'
  );
});

test('create rejette les ids déjà utilisés', async () => {
  const store = seedStore();
  await assert.rejects(
    () => store.create({
      id: 'u-admin-a',
      tenantId: 'school-a',
      email: 'autre@school-a.test',
      role: 'teacher',
      passwordHash: 'hash'
    }),
    /User id already exists/
  );
});

test('update modifie le mot de passe et l\'état actif', async () => {
  const store = seedStore();
  const updated = await store.update('u-teacher-a', {
    passwordHash: 'newhash',
    isActive: false
  });
  assert.equal(updated.passwordHash, 'newhash');
  assert.equal(updated.isActive, false);
  const reloaded = await store.getById('u-teacher-a');
  assert.equal(reloaded.passwordHash, 'newhash');
  assert.equal(reloaded.isActive, false);
});

test('update sur un id inconnu retourne null', async () => {
  const store = seedStore();
  assert.equal(await store.update('inconnu', { isActive: false }), null);
});

test('listByTenant filtre par tenant et ne fuit pas vers d\'autres tenants', async () => {
  const store = seedStore();
  const schoolA = await store.listByTenant('school-a');
  const emails = schoolA.map((u) => u.email).sort();
  assert.deepEqual(emails, ['admin@school-a.test', 'teacher@school-a.test']);
  for (const u of schoolA) {
    assert.equal(u.tenantId, 'school-a');
  }
});

test('listByTenant(null) retourne les super_admin uniquement', async () => {
  const store = seedStore();
  const supers = await store.listByTenant(null);
  assert.equal(supers.length, 1);
  assert.equal(supers[0].id, 'u-super');
});

test('listByTenant inclut les utilisateurs désactivés', async () => {
  const store = seedStore();
  await store.update('u-teacher-a', { isActive: false });
  const all = await store.listByTenant('school-a');
  const teacher = all.find((u) => u.id === 'u-teacher-a');
  assert.equal(teacher?.isActive, false);
});

test('normalizeEmail trim + lowercase', () => {
  assert.equal(normalizeEmail('  Foo@Bar.COM  '), 'foo@bar.com');
  assert.equal(normalizeEmail(undefined), '');
});
