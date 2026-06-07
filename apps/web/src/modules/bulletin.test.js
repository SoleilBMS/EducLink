const test = require('node:test');
const assert = require('node:assert/strict');

const { computeSubjectAverage, buildReportCard, isWithinTerm } = require('./bulletin');

function makeGrade({ score, coefficient = 1, subjectId = 'subject-math', date = '2026-04-15', title = 'Test' }) {
  return {
    score,
    subjectId,
    date,
    assessment: { coefficient, date, title, subjectId }
  };
}

test('BULL-01: computeSubjectAverage retourne null pour une liste vide', () => {
  assert.equal(computeSubjectAverage([]), null);
  assert.equal(computeSubjectAverage(null), null);
});

test('BULL-01: computeSubjectAverage calcule une moyenne pondérée par coefficient', () => {
  const grades = [
    makeGrade({ score: 16, coefficient: 2 }),
    makeGrade({ score: 10, coefficient: 1 })
  ];
  // (16*2 + 10*1) / (2+1) = 42/3 = 14
  assert.equal(computeSubjectAverage(grades), 14);
});

test('BULL-01: computeSubjectAverage arrondit à 2 décimales', () => {
  const grades = [
    makeGrade({ score: 15, coefficient: 1 }),
    makeGrade({ score: 10, coefficient: 1 }),
    makeGrade({ score: 13, coefficient: 1 })
  ];
  // (15+10+13)/3 = 38/3 = 12.666... → 12.67
  assert.equal(computeSubjectAverage(grades), 12.67);
});

test('BULL-01: computeSubjectAverage ignore les coefficients invalides', () => {
  const grades = [
    makeGrade({ score: 12, coefficient: 2 }),
    makeGrade({ score: 8, coefficient: 0 }),
    makeGrade({ score: 18, coefficient: -1 })
  ];
  // Seule la première note compte: 12
  assert.equal(computeSubjectAverage(grades), 12);
});

test('BULL-01: computeSubjectAverage retourne null si tous les coefficients sont invalides', () => {
  const grades = [makeGrade({ score: 10, coefficient: 0 })];
  assert.equal(computeSubjectAverage(grades), null);
});

test('BULL-01: isWithinTerm filtre correctement par dates inclusives', () => {
  const term = { starts_at: '2026-04-01', ends_at: '2026-06-30' };
  assert.equal(isWithinTerm('2026-04-01', term), true);
  assert.equal(isWithinTerm('2026-05-15', term), true);
  assert.equal(isWithinTerm('2026-06-30', term), true);
  assert.equal(isWithinTerm('2026-03-31', term), false);
  assert.equal(isWithinTerm('2026-07-01', term), false);
});

test('BULL-02: buildReportCard groupe par matière, calcule moyennes et générale', () => {
  const term = { id: 'term-t3', name: 'Trimestre 3', starts_at: '2026-04-01', ends_at: '2026-06-30' };
  const subjects = [
    { id: 'subject-math', name: 'Mathématiques', code: 'MATH' },
    { id: 'subject-fr', name: 'Français', code: 'FR' }
  ];
  const grades = [
    makeGrade({ score: 16, coefficient: 2, subjectId: 'subject-math', date: '2026-04-15' }),
    makeGrade({ score: 10, coefficient: 1, subjectId: 'subject-math', date: '2026-05-10' }),
    makeGrade({ score: 12, coefficient: 1, subjectId: 'subject-fr', date: '2026-04-20' }),
    makeGrade({ score: 8, coefficient: 1, subjectId: 'subject-fr', date: '2026-05-05' })
  ];

  const report = buildReportCard({
    student: { id: 'student-a1', firstName: 'Aya', lastName: 'Nadir' },
    classRoom: { id: 'class-a1', name: '6ème A' },
    term,
    grades,
    subjects
  });

  // Math: (16*2 + 10*1) / 3 = 14
  // FR: (12 + 8) / 2 = 10
  // Moyenne générale (arithmétique des moyennes matière): (14 + 10) / 2 = 12
  assert.equal(report.subjects.length, 2);
  const mathReport = report.subjects.find((r) => r.subjectId === 'subject-math');
  const frReport = report.subjects.find((r) => r.subjectId === 'subject-fr');
  assert.equal(mathReport.average, 14);
  assert.equal(frReport.average, 10);
  assert.equal(report.overallAverage, 12);
  assert.equal(report.evaluatedSubjectCount, 2);
  assert.equal(report.totalGradeCount, 4);
});

test('BULL-02: buildReportCard exclut les notes hors du trimestre', () => {
  const term = { id: 'term-t3', name: 'T3', starts_at: '2026-04-01', ends_at: '2026-06-30' };
  const subjects = [{ id: 'subject-math', name: 'Math', code: 'MATH' }];
  const grades = [
    makeGrade({ score: 18, coefficient: 1, subjectId: 'subject-math', date: '2026-04-15' }), // dans
    makeGrade({ score: 5, coefficient: 1, subjectId: 'subject-math', date: '2026-03-20' }), // avant
    makeGrade({ score: 0, coefficient: 1, subjectId: 'subject-math', date: '2026-07-15' }) // après
  ];

  const report = buildReportCard({
    student: { id: 's', firstName: 'X', lastName: 'Y' },
    classRoom: { id: 'c', name: 'C' },
    term,
    grades,
    subjects
  });

  assert.equal(report.totalGradeCount, 1);
  assert.equal(report.subjects[0].average, 18);
  assert.equal(report.overallAverage, 18);
});

test('BULL-02: buildReportCard retourne overallAverage=null si aucune note évaluable', () => {
  const term = { id: 'term-t1', name: 'T1', starts_at: '2026-01-01', ends_at: '2026-03-31' };
  const report = buildReportCard({
    student: { id: 's', firstName: 'X', lastName: 'Y' },
    classRoom: { id: 'c', name: 'C' },
    term,
    grades: [],
    subjects: [{ id: 'subject-math', name: 'Math', code: 'MATH' }]
  });
  assert.equal(report.subjects.length, 0);
  assert.equal(report.overallAverage, null);
  assert.equal(report.evaluatedSubjectCount, 0);
});

test('BULL-02: buildReportCard inclut les appréciations triées du plus récent au plus ancien', () => {
  const term = { id: 'term-t3', name: 'T3', starts_at: '2026-04-01', ends_at: '2026-06-30' };
  const report = buildReportCard({
    student: { id: 's', firstName: 'X', lastName: 'Y' },
    classRoom: { id: 'c', name: 'C' },
    term,
    grades: [],
    subjects: [],
    reportComments: [
      { id: 'rc-1', commentText: 'Vieille', created_at: '2026-04-10T10:00:00Z' },
      { id: 'rc-2', commentText: 'Récente', created_at: '2026-05-20T10:00:00Z' }
    ]
  });
  assert.equal(report.reportComments[0].id, 'rc-2');
  assert.equal(report.reportComments[1].id, 'rc-1');
});
