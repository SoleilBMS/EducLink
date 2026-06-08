const test = require('node:test');
const assert = require('node:assert/strict');

const { CoreSchoolStore } = require('./core-school');
const { StudentStore } = require('./student');
const {
  AttendanceEventsStore,
  ATTENDANCE_EVENT_TYPES,
  ATTENDANCE_EVENT_TYPE_LABELS_FR,
  MAX_COMMENT_LENGTH
} = require('./attendance-events');

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
  const store = new AttendanceEventsStore({ events: [], studentStore, classRoomStore: coreSchoolStore });
  return { store, coreSchoolStore, studentStore };
}

test('ATTENDANCE_EVENT_TYPES expose les quatre types attendus', () => {
  assert.deepEqual([...ATTENDANCE_EVENT_TYPES].sort(), ['encouragement', 'infirmary', 'observation', 'punition']);
  for (const type of ATTENDANCE_EVENT_TYPES) {
    assert.ok(ATTENDANCE_EVENT_TYPE_LABELS_FR[type], `label FR manquant pour ${type}`);
  }
});

test('create() persiste un événement valide et le retourne avec id + timestamps', () => {
  const { store } = buildFixture();
  const created = store.create('school-a', {
    date: '2026-04-20',
    classRoomId: 'class-a1',
    studentId: 'student-a1',
    recordedByUserId: 'teacher-a1',
    recordedByRole: 'teacher',
    eventType: 'encouragement',
    comment: 'Belle participation.'
  });
  assert.ok(created.id.startsWith('attendance-event-'));
  assert.equal(created.studentId, 'student-a1');
  assert.equal(created.eventType, 'encouragement');
  assert.equal(created.comment, 'Belle participation.');
  assert.ok(created.created_at);
});

test('create() rejette un type d\'événement inconnu', () => {
  const { store } = buildFixture();
  assert.throws(
    () => store.create('school-a', {
      date: '2026-04-20',
      classRoomId: 'class-a1',
      studentId: 'student-a1',
      recordedByUserId: 'teacher-a1',
      recordedByRole: 'teacher',
      eventType: 'inconnu',
      comment: ''
    }),
    /eventType must be one of/
  );
});

test('create() rejette un commentaire trop long', () => {
  const { store } = buildFixture();
  const longComment = 'x'.repeat(MAX_COMMENT_LENGTH + 1);
  assert.throws(
    () => store.create('school-a', {
      date: '2026-04-20',
      classRoomId: 'class-a1',
      studentId: 'student-a1',
      recordedByUserId: 'teacher-a1',
      recordedByRole: 'teacher',
      eventType: 'observation',
      comment: longComment
    }),
    /comment must be at most/
  );
});

test('create() rejette un élève qui n\'appartient pas à la classe ciblée', () => {
  const { store } = buildFixture();
  assert.throws(
    () => store.create('school-a', {
      date: '2026-04-20',
      classRoomId: 'class-a1',
      studentId: 'student-a2', // appartient à class-a2
      recordedByUserId: 'teacher-a1',
      recordedByRole: 'teacher',
      eventType: 'observation',
      comment: ''
    }),
    /studentId must reference an active student/
  );
});

test('create() rejette une classe inexistante dans le tenant', () => {
  const { store } = buildFixture();
  assert.throws(
    () => store.create('school-a', {
      date: '2026-04-20',
      classRoomId: 'class-unknown',
      studentId: 'student-a1',
      recordedByUserId: 'teacher-a1',
      recordedByRole: 'teacher',
      eventType: 'observation',
      comment: ''
    }),
    /classRoomId must reference an existing class room/
  );
});

test('list() filtre par date, classe et élève', () => {
  const { store } = buildFixture();
  store.create('school-a', { date: '2026-04-20', classRoomId: 'class-a1', studentId: 'student-a1', recordedByUserId: 'teacher-a1', recordedByRole: 'teacher', eventType: 'encouragement' });
  store.create('school-a', { date: '2026-04-21', classRoomId: 'class-a1', studentId: 'student-a1', recordedByUserId: 'teacher-a1', recordedByRole: 'teacher', eventType: 'observation' });
  store.create('school-a', { date: '2026-04-20', classRoomId: 'class-a2', studentId: 'student-a2', recordedByUserId: 'teacher-a1', recordedByRole: 'teacher', eventType: 'infirmary' });

  assert.equal(store.list('school-a').length, 3);
  assert.equal(store.list('school-a', { date: '2026-04-20' }).length, 2);
  assert.equal(store.list('school-a', { classRoomId: 'class-a1' }).length, 2);
  assert.equal(store.list('school-a', { studentId: 'student-a2' }).length, 1);
  assert.equal(store.list('other-tenant').length, 0);
});

test('delete() autorise le créateur à supprimer son événement', () => {
  const { store } = buildFixture();
  const event = store.create('school-a', { date: '2026-04-20', classRoomId: 'class-a1', studentId: 'student-a1', recordedByUserId: 'teacher-a1', recordedByRole: 'teacher', eventType: 'observation' });
  const removed = store.delete('school-a', event.id, { actorUserId: 'teacher-a1', actorRole: 'teacher' });
  assert.equal(removed.id, event.id);
  assert.equal(store.list('school-a').length, 0);
});

test('delete() refuse à un autre prof de supprimer un événement', () => {
  const { store } = buildFixture();
  const event = store.create('school-a', { date: '2026-04-20', classRoomId: 'class-a1', studentId: 'student-a1', recordedByUserId: 'teacher-a1', recordedByRole: 'teacher', eventType: 'observation' });
  assert.throws(
    () => store.delete('school-a', event.id, { actorUserId: 'teacher-a2', actorRole: 'teacher' }),
    /Only the recording user or a school admin can delete/
  );
  assert.equal(store.list('school-a').length, 1);
});

test('delete() autorise un school_admin à supprimer l\'événement d\'un prof', () => {
  const { store } = buildFixture();
  const event = store.create('school-a', { date: '2026-04-20', classRoomId: 'class-a1', studentId: 'student-a1', recordedByUserId: 'teacher-a1', recordedByRole: 'teacher', eventType: 'observation' });
  const removed = store.delete('school-a', event.id, { actorUserId: 'admin-a', actorRole: 'school_admin' });
  assert.ok(removed);
  assert.equal(store.list('school-a').length, 0);
});

test('delete() renvoie null pour un événement inconnu (sans throw)', () => {
  const { store } = buildFixture();
  const result = store.delete('school-a', 'unknown-id', { actorUserId: 'admin-a', actorRole: 'school_admin' });
  assert.equal(result, null);
});

test('cross-tenant : delete() refuse l\'accès à un événement d\'un autre tenant', () => {
  const { store } = buildFixture();
  const event = store.create('school-a', { date: '2026-04-20', classRoomId: 'class-a1', studentId: 'student-a1', recordedByUserId: 'teacher-a1', recordedByRole: 'teacher', eventType: 'observation' });
  const result = store.delete('other-tenant', event.id, { actorUserId: 'admin-a', actorRole: 'school_admin' });
  assert.equal(result, null);
  assert.equal(store.list('school-a').length, 1);
});
