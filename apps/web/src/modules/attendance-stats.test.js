const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AlertThresholdsStore,
  DEFAULT_THRESHOLDS,
  THRESHOLD_FIELD_LABELS_FR,
  THRESHOLD_LIMITS,
  computeStudentAbsenceStats,
  pickTopAbsent,
  pickTopLate,
  pickTopDiscipline,
  markAlerts,
  findCurrentTermId
} = require('./attendance-stats');

const SAMPLE_STUDENTS = [
  { id: 'student-a1', classRoomId: 'class-a1' },
  { id: 'student-a2', classRoomId: 'class-a1' },
  { id: 'student-a3', classRoomId: 'class-a2' }
];

test('DEFAULT_THRESHOLDS expose 4 champs avec valeurs raisonnables', () => {
  assert.equal(DEFAULT_THRESHOLDS.absentThreshold, 5);
  assert.equal(DEFAULT_THRESHOLDS.lateThreshold, 3);
  assert.equal(DEFAULT_THRESHOLDS.disciplineThreshold, 3);
  assert.equal(DEFAULT_THRESHOLDS.windowDays, 30);
  for (const key of Object.keys(DEFAULT_THRESHOLDS)) {
    assert.ok(THRESHOLD_FIELD_LABELS_FR[key], `label FR manquant pour ${key}`);
    assert.ok(THRESHOLD_LIMITS[key], `limites manquantes pour ${key}`);
  }
});

test('AlertThresholdsStore.get(tenantId) renvoie DEFAULT si jamais persistés', () => {
  const store = new AlertThresholdsStore();
  const t = store.get('school-a');
  assert.equal(t.absentThreshold, DEFAULT_THRESHOLDS.absentThreshold);
  assert.equal(t.lateThreshold, DEFAULT_THRESHOLDS.lateThreshold);
  assert.equal(t.disciplineThreshold, DEFAULT_THRESHOLDS.disciplineThreshold);
  assert.equal(t.windowDays, DEFAULT_THRESHOLDS.windowDays);
  assert.equal(t.isDefault, true);
});

test('AlertThresholdsStore.upsert valide entiers positifs et persiste', () => {
  const store = new AlertThresholdsStore();
  const persisted = store.upsert('school-a', { absentThreshold: 8, lateThreshold: 5, disciplineThreshold: 4, windowDays: 60 });
  assert.equal(persisted.absentThreshold, 8);
  assert.equal(persisted.isDefault, false);
  const reloaded = store.get('school-a');
  assert.equal(reloaded.absentThreshold, 8);
  assert.equal(reloaded.isDefault, false);
});

test('AlertThresholdsStore.upsert rejette valeurs négatives / 0 / > plafond', () => {
  const store = new AlertThresholdsStore();
  const baseInput = { absentThreshold: 5, lateThreshold: 3, disciplineThreshold: 3, windowDays: 30 };
  assert.throws(
    () => store.upsert('school-a', { ...baseInput, absentThreshold: 0 }),
    /must be between/
  );
  assert.throws(
    () => store.upsert('school-a', { ...baseInput, absentThreshold: -1 }),
    /must be between/
  );
  assert.throws(
    () => store.upsert('school-a', { ...baseInput, absentThreshold: 999 }),
    /must be between/
  );
  assert.throws(
    () => store.upsert('school-a', { ...baseInput, windowDays: 0 }),
    /must be between/
  );
  assert.throws(
    () => store.upsert('school-a', { ...baseInput, windowDays: 366 }),
    /must be between/
  );
});

test('computeStudentAbsenceStats agrège correctement les counts par élève', () => {
  const stats = computeStudentAbsenceStats({
    students: SAMPLE_STUDENTS,
    attendanceRecords: [
      { studentId: 'student-a1', date: '2026-05-10', status: 'absent' },
      { studentId: 'student-a1', date: '2026-05-11', status: 'absent' },
      { studentId: 'student-a1', date: '2026-05-12', status: 'absent' },
      { studentId: 'student-a1', date: '2026-05-13', status: 'excused' },
      { studentId: 'student-a1', date: '2026-05-14', status: 'excused' },
      { studentId: 'student-a1', date: '2026-05-15', status: 'late' },
      { studentId: 'student-a2', date: '2026-05-10', status: 'present' }
    ],
    disciplineRecords: []
  });
  const a1 = stats.find((s) => s.studentId === 'student-a1');
  assert.equal(a1.absentCount, 3);
  assert.equal(a1.excusedCount, 2);
  assert.equal(a1.lateCount, 1);
  assert.equal(a1.totalAbsence, 5);
  assert.equal(a1.disciplineCount, 0);
  const a2 = stats.find((s) => s.studentId === 'student-a2');
  assert.equal(a2.absentCount, 0);
  assert.equal(a2.totalAbsence, 0);
});

test('computeStudentAbsenceStats filtre par plage de dates from/to', () => {
  const stats = computeStudentAbsenceStats({
    students: SAMPLE_STUDENTS,
    attendanceRecords: [
      { studentId: 'student-a1', date: '2026-05-01', status: 'absent' },
      { studentId: 'student-a1', date: '2026-05-10', status: 'absent' },
      { studentId: 'student-a1', date: '2026-05-20', status: 'absent' }
    ],
    disciplineRecords: [],
    from: '2026-05-05',
    to: '2026-05-15'
  });
  assert.equal(stats.find((s) => s.studentId === 'student-a1').absentCount, 1);
});

test('pickTopAbsent trie par totalAbsence décroissant et filtre les zéros', () => {
  const stats = [
    { studentId: 'a', totalAbsence: 1, absentCount: 1, excusedCount: 0, lateCount: 0, disciplineCount: 0 },
    { studentId: 'b', totalAbsence: 5, absentCount: 5, excusedCount: 0, lateCount: 0, disciplineCount: 0 },
    { studentId: 'c', totalAbsence: 0, absentCount: 0, excusedCount: 0, lateCount: 0, disciplineCount: 0 },
    { studentId: 'd', totalAbsence: 3, absentCount: 3, excusedCount: 0, lateCount: 0, disciplineCount: 0 }
  ];
  const top = pickTopAbsent(stats, 10);
  assert.deepEqual(top.map((s) => s.studentId), ['b', 'd', 'a']);
});

test('pickTopLate trie par lateCount et limit', () => {
  const stats = [
    { studentId: 'a', lateCount: 2 },
    { studentId: 'b', lateCount: 5 },
    { studentId: 'c', lateCount: 1 },
    { studentId: 'd', lateCount: 0 }
  ];
  const top = pickTopLate(stats, 2);
  assert.equal(top.length, 2);
  assert.equal(top[0].studentId, 'b');
  assert.equal(top[1].studentId, 'a');
});

test('pickTopDiscipline trie par disciplineCount', () => {
  const stats = [
    { studentId: 'a', disciplineCount: 1 },
    { studentId: 'b', disciplineCount: 4 },
    { studentId: 'c', disciplineCount: 2 }
  ];
  const top = pickTopDiscipline(stats, 5);
  assert.deepEqual(top.map((s) => s.studentId), ['b', 'c', 'a']);
});

test('markAlerts flag correctement chaque seuil + isAnyAlert', () => {
  const stats = [
    { studentId: 'a', absentCount: 5, lateCount: 1, disciplineCount: 0, totalAbsence: 5 },
    { studentId: 'b', absentCount: 1, lateCount: 4, disciplineCount: 0, totalAbsence: 1 },
    { studentId: 'c', absentCount: 0, lateCount: 0, disciplineCount: 3, totalAbsence: 0 },
    { studentId: 'd', absentCount: 0, lateCount: 0, disciplineCount: 0, totalAbsence: 0 }
  ];
  const flagged = markAlerts(stats, DEFAULT_THRESHOLDS);
  assert.equal(flagged.find((s) => s.studentId === 'a').isAbsentAlert, true);
  assert.equal(flagged.find((s) => s.studentId === 'a').isAnyAlert, true);
  assert.equal(flagged.find((s) => s.studentId === 'b').isLateAlert, true);
  assert.equal(flagged.find((s) => s.studentId === 'b').isAbsentAlert, false);
  assert.equal(flagged.find((s) => s.studentId === 'c').isDisciplineAlert, true);
  assert.equal(flagged.find((s) => s.studentId === 'd').isAnyAlert, false);
});

test('findCurrentTermId renvoie le trimestre actif pour today', () => {
  const terms = [
    { id: 'term-a-t1', starts_at: '2025-09-01', ends_at: '2025-12-20' },
    { id: 'term-a-t2', starts_at: '2026-01-06', ends_at: '2026-03-31' },
    { id: 'term-a-t3', starts_at: '2026-04-01', ends_at: '2026-07-05' }
  ];
  assert.equal(findCurrentTermId(terms, '2026-06-08'), 'term-a-t3');
  assert.equal(findCurrentTermId(terms, '2026-02-15'), 'term-a-t2');
});

test('findCurrentTermId fallback sur le plus récent passé si today hors trimestre', () => {
  const terms = [
    { id: 'term-a-t1', starts_at: '2025-09-01', ends_at: '2025-12-20' },
    { id: 'term-a-t2', starts_at: '2026-01-06', ends_at: '2026-03-31' },
    { id: 'term-a-t3', starts_at: '2026-04-01', ends_at: '2026-07-05' }
  ];
  // Vacances été : aucun trimestre n'inclut today, on retombe sur t3
  assert.equal(findCurrentTermId(terms, '2026-08-15'), 'term-a-t3');
  // Avant tout : aucun start <= today → renvoie le dernier de la liste (fallback final)
  assert.equal(findCurrentTermId(terms, '2024-01-01'), 'term-a-t3');
});

test('computeStudentAbsenceStats croise discipline_records aussi', () => {
  const stats = computeStudentAbsenceStats({
    students: SAMPLE_STUDENTS,
    attendanceRecords: [],
    disciplineRecords: [
      { studentId: 'student-a1', occurredOn: '2026-05-10' },
      { studentId: 'student-a1', occurredOn: '2026-05-12' },
      { studentId: 'student-a2', occurredOn: '2026-05-15' }
    ],
    from: '2026-05-01',
    to: '2026-05-31'
  });
  assert.equal(stats.find((s) => s.studentId === 'student-a1').disciplineCount, 2);
  assert.equal(stats.find((s) => s.studentId === 'student-a2').disciplineCount, 1);
  assert.equal(stats.find((s) => s.studentId === 'student-a3').disciplineCount, 0);
});
