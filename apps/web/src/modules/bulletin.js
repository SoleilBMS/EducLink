function roundToTwo(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

function isWithinTerm(dateIso, term) {
  if (!dateIso || !term?.starts_at || !term?.ends_at) {
    return false;
  }
  return dateIso >= term.starts_at && dateIso <= term.ends_at;
}

function computeSubjectAverage(grades) {
  if (!Array.isArray(grades) || grades.length === 0) {
    return null;
  }
  let totalWeight = 0;
  let weightedSum = 0;
  for (const grade of grades) {
    const coefficient = Number(grade.assessment?.coefficient ?? 1);
    if (!Number.isFinite(coefficient) || coefficient <= 0) {
      continue;
    }
    const score = Number(grade.score);
    if (!Number.isFinite(score)) {
      continue;
    }
    totalWeight += coefficient;
    weightedSum += score * coefficient;
  }
  if (totalWeight === 0) {
    return null;
  }
  return roundToTwo(weightedSum / totalWeight);
}

function buildReportCard({ student, classRoom, term, grades, subjects, reportComments = [] }) {
  const subjectsById = new Map((subjects || []).map((subject) => [subject.id, subject]));
  const inTermGrades = (grades || []).filter((grade) => grade.assessment && isWithinTerm(grade.assessment.date, term));

  const bySubject = new Map();
  for (const grade of inTermGrades) {
    const key = grade.subjectId;
    if (!bySubject.has(key)) {
      bySubject.set(key, []);
    }
    bySubject.get(key).push(grade);
  }

  const subjectReports = [...bySubject.entries()]
    .map(([subjectId, subjectGrades]) => ({
      subjectId,
      subjectName: subjectsById.get(subjectId)?.name ?? subjectId,
      subjectCode: subjectsById.get(subjectId)?.code ?? '',
      grades: [...subjectGrades].sort((a, b) => (a.date < b.date ? -1 : 1)),
      average: computeSubjectAverage(subjectGrades)
    }))
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'fr'));

  const validAverages = subjectReports.map((report) => report.average).filter((value) => value !== null);
  const overallAverage =
    validAverages.length === 0 ? null : roundToTwo(validAverages.reduce((acc, value) => acc + value, 0) / validAverages.length);

  return {
    student,
    classRoom,
    term,
    subjects: subjectReports,
    overallAverage,
    evaluatedSubjectCount: validAverages.length,
    totalGradeCount: inTermGrades.length,
    reportComments: [...reportComments].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  };
}

module.exports = {
  computeSubjectAverage,
  buildReportCard,
  isWithinTerm,
  roundToTwo
};
