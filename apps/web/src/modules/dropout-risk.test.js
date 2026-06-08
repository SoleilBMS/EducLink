const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DropoutRiskAnalysesStore,
  RISK_LEVELS,
  RISK_LEVEL_LABELS_FR,
  RISK_LEVEL_BADGES,
  SCORING_WEIGHTS,
  SCORE_CAPS,
  RISK_THRESHOLDS,
  computeRiskScore,
  categorizeRisk,
  computeTermAverages,
  computeStudentRiskFactors,
  buildAnalysisPromptInput,
  isFresh
} = require('./dropout-risk');

const TERM_T2 = { id: 't2', starts_at: '2026-01-06', ends_at: '2026-03-31' };
const TERM_T3 = { id: 't3', starts_at: '2026-04-01', ends_at: '2026-07-05' };

test('VS-07: RISK_LEVELS + labels FR + badges + thresholds cohérents', () => {
  assert.deepEqual(RISK_LEVELS, ['low', 'moderate', 'high', 'critical']);
  for (const level of RISK_LEVELS) {
    assert.ok(RISK_LEVEL_LABELS_FR[level], `label FR manquant pour ${level}`);
    assert.ok(RISK_LEVEL_BADGES[level], `badge manquant pour ${level}`);
  }
  assert.ok(RISK_THRESHOLDS.moderate < RISK_THRESHOLDS.high);
  assert.ok(RISK_THRESHOLDS.high < RISK_THRESHOLDS.critical);
});

test('VS-07: computeRiskScore — élève parfait (0 partout) → 0', () => {
  const score = computeRiskScore({ absent: 0, late: 0, discipline: 0, gradeDrop: 0 });
  assert.equal(score, 0);
});

test('VS-07: computeRiskScore — élève à fond sur tous les axes (≥ cap) → 100', () => {
  const score = computeRiskScore({
    absent: SCORE_CAPS.absent + 5,
    late: SCORE_CAPS.late + 5,
    discipline: SCORE_CAPS.discipline + 5,
    gradeDrop: SCORE_CAPS.gradeDrop + 5
  });
  assert.equal(score, 100);
});

test('VS-07: computeRiskScore — un seul axe au cap n\'écrase pas le score (max ≈ 30 pour absent)', () => {
  const score = computeRiskScore({
    absent: SCORE_CAPS.absent,
    late: 0,
    discipline: 0,
    gradeDrop: 0
  });
  // Avec absent cap=10, weight=3 → 30 sur max=66 (10*3 + 10*1 + 8*2 + 5*2) ≈ 45
  assert.ok(score >= 35 && score <= 50, `expected absent-only ≈ 45 grâce au cap multi-axes, got ${score}`);
});

test('VS-07: computeRiskScore — pondération absences > retards à valeurs égales', () => {
  const absentScore = computeRiskScore({ absent: 5, late: 0, discipline: 0, gradeDrop: 0 });
  const lateScore = computeRiskScore({ absent: 0, late: 5, discipline: 0, gradeDrop: 0 });
  assert.ok(absentScore > lateScore, `absent (×${SCORING_WEIGHTS.absent}) doit peser plus que late (×${SCORING_WEIGHTS.late})`);
});

test('VS-07: computeRiskScore — gradeDrop négatif (élève qui progresse) contribue 0', () => {
  const score = computeRiskScore({ absent: 0, late: 0, discipline: 0, gradeDrop: -3 });
  assert.equal(score, 0);
});

test('VS-07: categorizeRisk — seuils bornes', () => {
  assert.equal(categorizeRisk(0), 'low');
  assert.equal(categorizeRisk(RISK_THRESHOLDS.moderate - 1), 'low');
  assert.equal(categorizeRisk(RISK_THRESHOLDS.moderate), 'moderate');
  assert.equal(categorizeRisk(RISK_THRESHOLDS.high), 'high');
  assert.equal(categorizeRisk(RISK_THRESHOLDS.critical), 'critical');
  assert.equal(categorizeRisk(100), 'critical');
});

test('VS-07: computeTermAverages — 0 grade → both null', () => {
  const result = computeTermAverages([], TERM_T3, TERM_T2);
  assert.equal(result.currentAverage, null);
  assert.equal(result.previousAverage, null);
});

test('VS-07: computeTermAverages — grades current term seulement', () => {
  const grades = [
    { subjectId: 'math', score: 12, assessment: { date: '2026-04-10', coefficient: 1 } },
    { subjectId: 'math', score: 14, assessment: { date: '2026-04-20', coefficient: 2 } },
    { subjectId: 'fr', score: 10, assessment: { date: '2026-05-01', coefficient: 1 } }
  ];
  const result = computeTermAverages(grades, TERM_T3, TERM_T2);
  // math: (12*1 + 14*2) / 3 = 40/3 ≈ 13.33 ; fr: 10 ; overall: (13.33 + 10) / 2 ≈ 11.67
  assert.ok(result.currentAverage !== null && result.currentAverage > 11 && result.currentAverage < 12);
  assert.equal(result.previousAverage, null);
});

test('VS-07: computeTermAverages — grades dans les 2 trimestres', () => {
  const grades = [
    { subjectId: 'math', score: 16, assessment: { date: '2026-02-10', coefficient: 1 } },
    { subjectId: 'fr', score: 14, assessment: { date: '2026-03-01', coefficient: 1 } },
    { subjectId: 'math', score: 8, assessment: { date: '2026-05-10', coefficient: 1 } },
    { subjectId: 'fr', score: 6, assessment: { date: '2026-05-15', coefficient: 1 } }
  ];
  const result = computeTermAverages(grades, TERM_T3, TERM_T2);
  // T2: (16+14)/2 = 15 ; T3: (8+6)/2 = 7
  assert.equal(result.currentAverage, 7);
  assert.equal(result.previousAverage, 15);

  const factors = computeStudentRiskFactors({
    stats: { absentCount: 0, lateCount: 0, disciplineCount: 0 },
    averages: result
  });
  assert.equal(factors.gradeDrop, 8); // 15 - 7
});

test('VS-07: buildAnalysisPromptInput contient tous les champs clés', () => {
  const input = buildAnalysisPromptInput(
    { firstName: 'Aya', lastName: 'Nadir', classRoomId: 'class-a1' },
    { name: 'A1' },
    { absent: 5, late: 2, discipline: 1, gradeDrop: 3, currentAverage: 9.5, previousAverage: 12.5 },
    62,
    'high'
  );
  assert.ok(input.includes('Aya Nadir'));
  assert.ok(input.includes('A1'));
  assert.ok(input.includes('62/100'));
  assert.ok(input.includes('Élevé'));
  assert.ok(input.includes('Absences non justifiées: 5'));
  assert.ok(input.includes('Retards: 2'));
  assert.ok(input.includes('Mesures disciplinaires: 1'));
  assert.ok(input.includes('9.50/20'));
  assert.ok(input.includes('12.50/20'));
});

test('VS-07: DropoutRiskAnalysesStore.create + getLatest round-trip', () => {
  const store = new DropoutRiskAnalysesStore();
  const created = store.create('school-a', {
    studentId: 'student-a1',
    score: 72,
    level: 'critical',
    factors: { absent: 8, late: 3, discipline: 4, gradeDrop: 4, currentAverage: 7, previousAverage: 11 },
    summary: 'Élève en risque critique. Plusieurs absences non justifiées et baisse marquée. Recommandation: rendez-vous famille rapide.',
    generatedByUserId: 'admin-a',
    aiProvider: 'dev-echo'
  });
  assert.ok(created.id.startsWith('dropout-risk-'));
  assert.equal(created.score, 72);
  assert.equal(created.level, 'critical');

  const latest = store.getLatest('school-a', 'student-a1');
  assert.equal(latest.id, created.id);
});

test('VS-07: DropoutRiskAnalysesStore.list filtre par studentId et minLevel', () => {
  const store = new DropoutRiskAnalysesStore();
  store.create('school-a', { studentId: 'a1', score: 10, level: 'low', factors: {}, summary: 's', generatedByUserId: 'admin-a', aiProvider: 'dev-echo' });
  store.create('school-a', { studentId: 'a2', score: 50, level: 'high', factors: {}, summary: 's', generatedByUserId: 'admin-a', aiProvider: 'dev-echo' });
  store.create('school-a', { studentId: 'a3', score: 80, level: 'critical', factors: {}, summary: 's', generatedByUserId: 'admin-a', aiProvider: 'dev-echo' });

  assert.equal(store.list('school-a').length, 3);
  assert.equal(store.list('school-a', { studentId: 'a2' }).length, 1);
  assert.equal(store.list('school-a', { minLevel: 'high' }).length, 2); // high + critical
  assert.equal(store.list('school-a', { minLevel: 'critical' }).length, 1);
  assert.equal(store.list('other-tenant').length, 0);
});

test('VS-07: isFresh — frais juste créé, périmé après 8 jours, false sans date', () => {
  const fresh = { generated_at: new Date().toISOString() };
  assert.equal(isFresh(fresh, 7), true);

  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(isFresh({ generated_at: eightDaysAgo }, 7), false);

  assert.equal(isFresh(null, 7), false);
  assert.equal(isFresh({}, 7), false);
});

test('VS-07: DropoutRiskAnalysesStore — cross-tenant isolation', () => {
  const store = new DropoutRiskAnalysesStore();
  store.create('school-a', { studentId: 'shared-id', score: 30, level: 'moderate', factors: {}, summary: 's', generatedByUserId: 'admin-a', aiProvider: 'dev-echo' });
  assert.equal(store.getLatest('school-b', 'shared-id'), null);
  assert.equal(store.list('school-b').length, 0);
});

test('VS-07: create() rejette les inputs invalides', () => {
  const store = new DropoutRiskAnalysesStore();
  assert.throws(() => store.create('school-a', { studentId: '', score: 50, level: 'high', summary: 's', generatedByUserId: 'admin-a', aiProvider: 'dev-echo' }), /studentId is required/);
  assert.throws(() => store.create('school-a', { studentId: 'a1', score: -1, level: 'high', summary: 's', generatedByUserId: 'admin-a', aiProvider: 'dev-echo' }), /score must be an integer/);
  assert.throws(() => store.create('school-a', { studentId: 'a1', score: 101, level: 'high', summary: 's', generatedByUserId: 'admin-a', aiProvider: 'dev-echo' }), /score must be an integer/);
  assert.throws(() => store.create('school-a', { studentId: 'a1', score: 50, level: 'unknown', summary: 's', generatedByUserId: 'admin-a', aiProvider: 'dev-echo' }), /level must be one of/);
  assert.throws(() => store.create('school-a', { studentId: 'a1', score: 50, level: 'high', summary: '', generatedByUserId: 'admin-a', aiProvider: 'dev-echo' }), /summary is required/);
});
