const test = require('node:test');
const assert = require('node:assert/strict');

const { CoreSchoolStore } = require('./core-school');
const { StudentStore } = require('./student');
const { ParentStore } = require('./parent');
const {
  DisciplineStore,
  DISCIPLINE_MEASURE_TYPES,
  DISCIPLINE_MEASURE_LABELS_FR,
  DISCIPLINE_MEASURE_BADGES,
  MAX_DESCRIPTION_LENGTH,
  MAX_DURATION_MINUTES
} = require('./discipline');

function buildFixture() {
  const coreSchoolStore = new CoreSchoolStore({
    classRooms: [
      { id: 'class-a1', tenant_id: 'school-a', name: 'A1', gradeLevelId: 'g-a1', capacity: 30 },
      { id: 'class-a2', tenant_id: 'school-a', name: 'A2', gradeLevelId: 'g-a1', capacity: 30 }
    ],
    subjects: [],
    academicYears: [],
    terms: [],
    schools: [],
    gradeLevels: []
  });
  const studentStore = new StudentStore({
    students: [
      { id: 'student-a1', tenant_id: 'school-a', firstName: 'Aya', lastName: 'N', admissionNumber: 'A-1', classRoomId: 'class-a1', dateOfBirth: '2013-01-01', archived_at: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
      { id: 'student-a2', tenant_id: 'school-a', firstName: 'Bilal', lastName: 'K', admissionNumber: 'A-2', classRoomId: 'class-a2', dateOfBirth: '2013-01-01', archived_at: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }
    ],
    classRoomStore: coreSchoolStore
  });
  const parentStore = new ParentStore({
    parents: [
      { id: 'parent-a1', tenant_id: 'school-a', firstName: 'Nadia', lastName: 'N', phone: '', email: '', address: '', notes: '', archived_at: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }
    ],
    links: [
      { id: 'spl-a1', tenant_id: 'school-a', parentId: 'parent-a1', studentId: 'student-a1', relationship: 'mother', isPrimaryContact: true }
    ],
    studentStore
  });
  const store = new DisciplineStore({ records: [], studentStore, parentStore });
  return { store, studentStore, parentStore, coreSchoolStore };
}

const BASE_PAYLOAD = {
  studentId: 'student-a1',
  recordedByUserId: 'teacher-a1',
  recordedByRole: 'teacher',
  occurredOn: '2026-05-10',
  description: 'Bavardages répétés en classe.'
};

test('DISCIPLINE_MEASURE_TYPES expose 4 types avec labels FR + badges', () => {
  assert.deepEqual([...DISCIPLINE_MEASURE_TYPES].sort(), ['detention', 'exclusion', 'observation', 'parent_meeting']);
  for (const t of DISCIPLINE_MEASURE_TYPES) {
    assert.ok(DISCIPLINE_MEASURE_LABELS_FR[t], `label FR manquant pour ${t}`);
    assert.ok(DISCIPLINE_MEASURE_BADGES[t], `badge manquant pour ${t}`);
  }
});

test('create() observation valide (sans scheduledFor, sans duration)', () => {
  const { store } = buildFixture();
  const record = store.create('school-a', { ...BASE_PAYLOAD, measureType: 'observation' });
  assert.ok(record.id.startsWith('discipline-'));
  assert.equal(record.measureType, 'observation');
  assert.equal(record.scheduledFor, null);
  assert.equal(record.durationMinutes, null);
});

test('create() retenue valide (scheduledFor + duration 60 min)', () => {
  const { store } = buildFixture();
  const record = store.create('school-a', {
    ...BASE_PAYLOAD,
    measureType: 'detention',
    scheduledFor: '2026-05-15',
    durationMinutes: 60
  });
  assert.equal(record.measureType, 'detention');
  assert.equal(record.scheduledFor, '2026-05-15');
  assert.equal(record.durationMinutes, 60);
});

test('create() exclusion valide (1440 min = 1 jour)', () => {
  const { store } = buildFixture();
  const record = store.create('school-a', {
    ...BASE_PAYLOAD,
    measureType: 'exclusion',
    scheduledFor: '2026-05-20',
    durationMinutes: 1440
  });
  assert.equal(record.measureType, 'exclusion');
  assert.equal(record.durationMinutes, 1440);
});

test('create() convocation parents valide (scheduledFor seul, duration ignorée)', () => {
  const { store } = buildFixture();
  const record = store.create('school-a', {
    ...BASE_PAYLOAD,
    measureType: 'parent_meeting',
    scheduledFor: '2026-05-25'
  });
  assert.equal(record.measureType, 'parent_meeting');
  assert.equal(record.scheduledFor, '2026-05-25');
  assert.equal(record.durationMinutes, null);
});

test('create() rejette un type hors enum', () => {
  const { store } = buildFixture();
  assert.throws(
    () => store.create('school-a', { ...BASE_PAYLOAD, measureType: 'spanking' }),
    /measureType must be one of/
  );
});

test('create() rejette une description trop longue', () => {
  const { store } = buildFixture();
  const long = 'x'.repeat(MAX_DESCRIPTION_LENGTH + 1);
  assert.throws(
    () => store.create('school-a', { ...BASE_PAYLOAD, measureType: 'observation', description: long }),
    /description must be at most/
  );
});

test('create() rejette une retenue sans duration', () => {
  const { store } = buildFixture();
  assert.throws(
    () => store.create('school-a', { ...BASE_PAYLOAD, measureType: 'detention', scheduledFor: '2026-05-15' }),
    /durationMinutes is required for detention/
  );
});

test('create() rejette une observation avec scheduledFor (cohérence sémantique)', () => {
  const { store } = buildFixture();
  assert.throws(
    () => store.create('school-a', { ...BASE_PAYLOAD, measureType: 'observation', scheduledFor: '2026-05-15' }),
    /scheduledFor must not be provided for an observation/
  );
});

test('create() rejette un élève inexistant ou cross-tenant', () => {
  const { store } = buildFixture();
  assert.throws(
    () => store.create('school-a', { ...BASE_PAYLOAD, measureType: 'observation', studentId: 'student-z' }),
    /studentId must reference an active student/
  );
  assert.throws(
    () => store.create('other-tenant', { ...BASE_PAYLOAD, measureType: 'observation' }),
    /studentId must reference an active student/
  );
});

test('list() filtre par measureType, studentId, plage de dates from/to', () => {
  const { store } = buildFixture();
  store.create('school-a', { ...BASE_PAYLOAD, measureType: 'observation', occurredOn: '2026-05-10' });
  store.create('school-a', { ...BASE_PAYLOAD, measureType: 'detention', occurredOn: '2026-05-12', scheduledFor: '2026-05-15', durationMinutes: 60 });
  store.create('school-a', { ...BASE_PAYLOAD, studentId: 'student-a2', measureType: 'observation', occurredOn: '2026-05-14' });

  assert.equal(store.list('school-a').length, 3);
  assert.equal(store.list('school-a', { measureType: 'observation' }).length, 2);
  assert.equal(store.list('school-a', { studentId: 'student-a2' }).length, 1);
  assert.equal(store.list('school-a', { from: '2026-05-12' }).length, 2);
  assert.equal(store.list('school-a', { from: '2026-05-12', to: '2026-05-13' }).length, 1);
});

test('delete() : owner OK / autre user 403 / admin OK / autre tenant null', () => {
  const { store } = buildFixture();
  const rec = store.create('school-a', { ...BASE_PAYLOAD, measureType: 'observation' });

  // Autre teacher refuse
  assert.throws(
    () => store.delete('school-a', rec.id, { actorUserId: 'teacher-a2', actorRole: 'teacher' }),
    /Only the recording user or a school admin/
  );
  assert.equal(store.list('school-a').length, 1, 'pas supprimé après refus');

  // Owner OK
  const removed = store.delete('school-a', rec.id, { actorUserId: 'teacher-a1', actorRole: 'teacher' });
  assert.equal(removed.id, rec.id);
  assert.equal(store.list('school-a').length, 0);

  // Admin/director OK
  const rec2 = store.create('school-a', { ...BASE_PAYLOAD, measureType: 'observation' });
  const removedByAdmin = store.delete('school-a', rec2.id, { actorUserId: 'admin-a', actorRole: 'school_admin' });
  assert.ok(removedByAdmin);

  // Cross-tenant
  const rec3 = store.create('school-a', { ...BASE_PAYLOAD, measureType: 'observation' });
  const crossResult = store.delete('other-tenant', rec3.id, { actorUserId: 'admin-x', actorRole: 'school_admin' });
  assert.equal(crossResult, null);
  assert.equal(store.list('school-a').length, 1, 'record intact après tentative cross-tenant');
});

test('listForParent() ne renvoie que les enfants liés du parent', () => {
  const { store } = buildFixture();
  store.create('school-a', { ...BASE_PAYLOAD, studentId: 'student-a1', measureType: 'observation' });
  store.create('school-a', { ...BASE_PAYLOAD, studentId: 'student-a2', measureType: 'observation' });

  // parent-a1 est lié à student-a1 seulement
  const list = store.listForParent('school-a', 'parent-a1');
  assert.equal(list.length, 1);
  assert.equal(list[0].studentId, 'student-a1');
});

test('MAX_DURATION_MINUTES est borné à 1 semaine (7 jours × 24h × 60min)', () => {
  const { store } = buildFixture();
  assert.equal(MAX_DURATION_MINUTES, 10080);
  assert.throws(
    () => store.create('school-a', { ...BASE_PAYLOAD, measureType: 'detention', scheduledFor: '2026-05-15', durationMinutes: 10081 }),
    /must be at most 10080/
  );
});
