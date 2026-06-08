const test = require('node:test');
const assert = require('node:assert/strict');

const { CoreSchoolStore } = require('./core-school');
const { StudentStore } = require('./student');
const { ParentStore } = require('./parent');
const {
  AbsenceNoticesStore,
  ABSENCE_REASONS,
  ABSENCE_REASON_LABELS_FR,
  ABSENCE_STATUSES,
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_SIZE_BYTES,
  MAX_COMMENT_LENGTH
} = require('./absence-notices');

function buildFixture() {
  const coreSchoolStore = new CoreSchoolStore({
    classRooms: [
      { id: 'class-a1', tenant_id: 'school-a', name: 'A1', gradeLevelId: 'g-a1', capacity: 30 },
      { id: 'class-b1', tenant_id: 'school-b', name: 'B1', gradeLevelId: 'g-b1', capacity: 30 }
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
      { id: 'student-a2', tenant_id: 'school-a', firstName: 'Bilal', lastName: 'K', admissionNumber: 'A-2', classRoomId: 'class-a1', dateOfBirth: '2013-01-01', archived_at: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
      { id: 'student-b1', tenant_id: 'school-b', firstName: 'Zara', lastName: 'M', admissionNumber: 'B-1', classRoomId: 'class-b1', dateOfBirth: '2013-01-01', archived_at: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }
    ],
    classRoomStore: coreSchoolStore
  });
  const parentStore = new ParentStore({
    parents: [
      { id: 'parent-a1', tenant_id: 'school-a', firstName: 'Nadia', lastName: 'N', phone: '', email: '', address: '', notes: '', archived_at: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
      { id: 'parent-a2', tenant_id: 'school-a', firstName: 'Karim', lastName: 'B', phone: '', email: '', address: '', notes: '', archived_at: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
      { id: 'parent-b1', tenant_id: 'school-b', firstName: 'Lila', lastName: 'M', phone: '', email: '', address: '', notes: '', archived_at: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }
    ],
    links: [
      { id: 'spl-a1', tenant_id: 'school-a', parentId: 'parent-a1', studentId: 'student-a1', relationship: 'mother', isPrimaryContact: true },
      { id: 'spl-a2', tenant_id: 'school-a', parentId: 'parent-a2', studentId: 'student-a2', relationship: 'father', isPrimaryContact: true },
      { id: 'spl-b1', tenant_id: 'school-b', parentId: 'parent-b1', studentId: 'student-b1', relationship: 'mother', isPrimaryContact: true }
    ],
    studentStore
  });
  const store = new AbsenceNoticesStore({ notices: [], parentStore, studentStore });
  return { store, parentStore, studentStore, coreSchoolStore };
}

const VALID_PAYLOAD = {
  studentId: 'student-a1',
  createdByUserId: 'parent-a1',
  startDate: '2026-05-10',
  endDate: '2026-05-12',
  reason: 'maladie',
  comment: 'Angine, certificat médical à venir.'
};

test('ABSENCE_REASONS expose les 4 motifs attendus avec libellés FR', () => {
  assert.deepEqual(
    [...ABSENCE_REASONS].sort(),
    ['autre', 'maladie', 'raison-familiale', 'rdv-medical']
  );
  for (const reason of ABSENCE_REASONS) {
    assert.ok(ABSENCE_REASON_LABELS_FR[reason], `label FR manquant pour ${reason}`);
  }
  assert.deepEqual([...ABSENCE_STATUSES].sort(), ['approved', 'pending', 'rejected']);
});

test('create() persiste une notice sans fichier avec statut pending', () => {
  const { store } = buildFixture();
  const notice = store.create('school-a', VALID_PAYLOAD);
  assert.ok(notice.id.startsWith('absence-notice-'));
  assert.equal(notice.status, 'pending');
  assert.equal(notice.studentId, 'student-a1');
  assert.equal(notice.createdByUserId, 'parent-a1');
  assert.equal(notice.reason, 'maladie');
  assert.equal(notice.hasDocument, false);
  assert.equal(notice.documentFileName, null);
  assert.ok(notice.created_at);
});

test('create() persiste une notice avec un PDF en pièce jointe', () => {
  const { store } = buildFixture();
  const pdfBuffer = Buffer.from('%PDF-1.4 test content', 'utf8');
  const notice = store.create('school-a', {
    ...VALID_PAYLOAD,
    document: { fileName: 'certif.pdf', mimeType: 'application/pdf', data: pdfBuffer }
  });
  assert.equal(notice.hasDocument, true);
  assert.equal(notice.documentFileName, 'certif.pdf');
  assert.equal(notice.documentMimeType, 'application/pdf');
  assert.equal(notice.documentSizeBytes, pdfBuffer.length);

  const doc = store.getDocument('school-a', notice.id);
  assert.ok(doc);
  assert.ok(Buffer.isBuffer(doc.data));
  assert.equal(doc.data.toString('utf8'), '%PDF-1.4 test content');
  assert.equal(doc.mimeType, 'application/pdf');
});

test('create() rejette une endDate antérieure à startDate', () => {
  const { store } = buildFixture();
  assert.throws(
    () => store.create('school-a', { ...VALID_PAYLOAD, startDate: '2026-05-12', endDate: '2026-05-10' }),
    /endDate must be greater than or equal/
  );
});

test('create() rejette un motif hors enum', () => {
  const { store } = buildFixture();
  assert.throws(
    () => store.create('school-a', { ...VALID_PAYLOAD, reason: 'vacances' }),
    /reason must be one of/
  );
});

test('create() rejette un commentaire trop long', () => {
  const { store } = buildFixture();
  const longComment = 'x'.repeat(MAX_COMMENT_LENGTH + 1);
  assert.throws(
    () => store.create('school-a', { ...VALID_PAYLOAD, comment: longComment }),
    /comment must be at most/
  );
});

test('create() rejette un MIME type interdit', () => {
  const { store } = buildFixture();
  assert.throws(
    () => store.create('school-a', {
      ...VALID_PAYLOAD,
      document: { fileName: 'page.html', mimeType: 'text/html', data: Buffer.from('<html>') }
    }),
    /document\.mimeType must be one of/
  );
  assert.ok(ALLOWED_DOCUMENT_MIME_TYPES.includes('application/pdf'));
});

test('create() rejette un fichier dépassant MAX_DOCUMENT_SIZE_BYTES', () => {
  const { store } = buildFixture();
  const tooBig = Buffer.alloc(MAX_DOCUMENT_SIZE_BYTES + 1, 0x00);
  assert.throws(
    () => store.create('school-a', {
      ...VALID_PAYLOAD,
      document: { fileName: 'big.pdf', mimeType: 'application/pdf', data: tooBig }
    }),
    /document\.data must be at most/
  );
});

test('create() rejette un parent non lié à l\'élève (ownership)', () => {
  const { store } = buildFixture();
  // parent-a2 est lié à student-a2, pas student-a1
  assert.throws(
    () => store.create('school-a', { ...VALID_PAYLOAD, createdByUserId: 'parent-a2' }),
    /parent linked to this student/
  );
});

test('list() filtre par parentId, studentId, status', () => {
  const { store } = buildFixture();
  store.create('school-a', VALID_PAYLOAD);
  store.create('school-a', {
    ...VALID_PAYLOAD,
    studentId: 'student-a2',
    createdByUserId: 'parent-a2',
    startDate: '2026-05-15',
    endDate: '2026-05-15',
    reason: 'autre'
  });

  assert.equal(store.list('school-a').length, 2);
  assert.equal(store.list('school-a', { parentId: 'parent-a1' }).length, 1);
  assert.equal(store.list('school-a', { studentId: 'student-a2' }).length, 1);
  assert.equal(store.list('school-a', { status: 'pending' }).length, 2);
  assert.equal(store.list('school-a', { status: 'approved' }).length, 0);
  assert.equal(store.list('other-tenant').length, 0);
});

test('cross-tenant : notice school-a invisible depuis school-b', () => {
  const { store } = buildFixture();
  const notice = store.create('school-a', VALID_PAYLOAD);
  assert.equal(store.list('school-b').length, 0);
  assert.equal(store.get('school-b', notice.id), null);
  assert.equal(store.getDocument('school-b', notice.id), null);
});

test('getDocument() renvoie null si aucun fichier joint', () => {
  const { store } = buildFixture();
  const notice = store.create('school-a', VALID_PAYLOAD);
  assert.equal(store.getDocument('school-a', notice.id), null);
});

test('getDocument() renvoie le buffer + mime + filename complet', () => {
  const { store } = buildFixture();
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG magic
  const notice = store.create('school-a', {
    ...VALID_PAYLOAD,
    document: { fileName: 'photo.png', mimeType: 'image/png', data: png }
  });
  const doc = store.getDocument('school-a', notice.id);
  assert.deepEqual(doc.data, png);
  assert.equal(doc.fileName, 'photo.png');
  assert.equal(doc.mimeType, 'image/png');
  assert.equal(doc.sizeBytes, png.length);
});
