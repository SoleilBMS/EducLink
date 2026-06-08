const crypto = require('node:crypto');

const { buildValidationError } = require('./error-utils');
const { isWithinTerm, computeSubjectAverage } = require('./bulletin');

const RISK_LEVELS = ['low', 'moderate', 'high', 'critical'];

const RISK_LEVEL_LABELS_FR = Object.freeze({
  low: 'Faible',
  moderate: 'Modéré',
  high: 'Élevé',
  critical: 'Critique'
});

const RISK_LEVEL_BADGES = Object.freeze({
  low: 'is-success',
  moderate: 'is-info',
  high: 'is-warning',
  critical: 'is-error'
});

const SCORING_WEIGHTS = Object.freeze({
  absent: 3,
  late: 1,
  discipline: 2,
  gradeDrop: 2
});

// Cap = saturation par axe avant pondération.
// gradeDrop est en points/20 donc on plafonne à 5 (baisse de 5 points sur 20 = signal max).
const SCORE_CAPS = Object.freeze({
  absent: 10,
  late: 10,
  discipline: 8,
  gradeDrop: 5
});

const RISK_THRESHOLDS = Object.freeze({
  moderate: 20,
  high: 45,
  critical: 70
});

const ANALYSIS_FRESHNESS_DAYS = 7;
const MAX_SUMMARY_LENGTH = 2000;

function computeOverallAverageForTerm(grades, term) {
  if (!Array.isArray(grades) || grades.length === 0 || !term) return null;
  const inTerm = grades.filter((g) => g.assessment && isWithinTerm(g.assessment.date, term));
  if (inTerm.length === 0) return null;
  const bySubject = new Map();
  for (const g of inTerm) {
    if (!bySubject.has(g.subjectId)) bySubject.set(g.subjectId, []);
    bySubject.get(g.subjectId).push(g);
  }
  const subjectAverages = [...bySubject.values()]
    .map(computeSubjectAverage)
    .filter((v) => v !== null && Number.isFinite(v));
  if (subjectAverages.length === 0) return null;
  return subjectAverages.reduce((a, b) => a + b, 0) / subjectAverages.length;
}

function computeTermAverages(grades, currentTerm, previousTerm) {
  return {
    currentAverage: computeOverallAverageForTerm(grades, currentTerm),
    previousAverage: computeOverallAverageForTerm(grades, previousTerm)
  };
}

function computeStudentRiskFactors({ stats, averages }) {
  const safeStats = stats || { absentCount: 0, lateCount: 0, disciplineCount: 0 };
  const safeAverages = averages || { currentAverage: null, previousAverage: null };
  let gradeDrop = 0;
  if (
    safeAverages.currentAverage !== null
    && safeAverages.previousAverage !== null
    && safeAverages.previousAverage > safeAverages.currentAverage
  ) {
    gradeDrop = safeAverages.previousAverage - safeAverages.currentAverage;
  }
  return {
    absent: safeStats.absentCount || 0,
    late: safeStats.lateCount || 0,
    discipline: safeStats.disciplineCount || 0,
    gradeDrop,
    currentAverage: safeAverages.currentAverage,
    previousAverage: safeAverages.previousAverage
  };
}

function computeRiskScore(factors) {
  const safe = factors || {};
  const cappedAbsent = Math.min(Math.max(0, safe.absent || 0), SCORE_CAPS.absent);
  const cappedLate = Math.min(Math.max(0, safe.late || 0), SCORE_CAPS.late);
  const cappedDiscipline = Math.min(Math.max(0, safe.discipline || 0), SCORE_CAPS.discipline);
  const cappedGradeDrop = Math.min(Math.max(0, safe.gradeDrop || 0), SCORE_CAPS.gradeDrop);

  const raw =
    cappedAbsent * SCORING_WEIGHTS.absent
    + cappedLate * SCORING_WEIGHTS.late
    + cappedDiscipline * SCORING_WEIGHTS.discipline
    + cappedGradeDrop * SCORING_WEIGHTS.gradeDrop;

  const max =
    SCORE_CAPS.absent * SCORING_WEIGHTS.absent
    + SCORE_CAPS.late * SCORING_WEIGHTS.late
    + SCORE_CAPS.discipline * SCORING_WEIGHTS.discipline
    + SCORE_CAPS.gradeDrop * SCORING_WEIGHTS.gradeDrop;

  return Math.round((raw / max) * 100);
}

function categorizeRisk(score) {
  if (score >= RISK_THRESHOLDS.critical) return 'critical';
  if (score >= RISK_THRESHOLDS.high) return 'high';
  if (score >= RISK_THRESHOLDS.moderate) return 'moderate';
  return 'low';
}

function buildAnalysisPromptInput(student, classRoom, factors, score, level) {
  const safe = factors || {};
  const fullName = student ? `${student.firstName} ${student.lastName}` : '(élève inconnu)';
  const className = classRoom?.name || student?.classRoomId || '(classe inconnue)';
  const currentAverageDisplay = safe.currentAverage !== null && safe.currentAverage !== undefined
    ? `${(Math.round(safe.currentAverage * 100) / 100).toFixed(2)}/20`
    : 'non disponible';
  const previousAverageDisplay = safe.previousAverage !== null && safe.previousAverage !== undefined
    ? `${(Math.round(safe.previousAverage * 100) / 100).toFixed(2)}/20`
    : 'non disponible';
  const gradeDropDisplay = safe.gradeDrop && safe.gradeDrop > 0
    ? `baisse de ${(Math.round(safe.gradeDrop * 100) / 100).toFixed(2)} points`
    : 'pas de baisse significative';
  return [
    `Élève: ${fullName} (classe ${className})`,
    `Score de risque calculé: ${score}/100 — niveau ${RISK_LEVEL_LABELS_FR[level] || level}`,
    `Absences non justifiées: ${safe.absent || 0}`,
    `Retards: ${safe.late || 0}`,
    `Mesures disciplinaires: ${safe.discipline || 0}`,
    `Moyenne trimestre courant: ${currentAverageDisplay}`,
    `Moyenne trimestre précédent: ${previousAverageDisplay}`,
    `Évolution des notes: ${gradeDropDisplay}`
  ].join('\n');
}

function isFresh(analysis, days = ANALYSIS_FRESHNESS_DAYS) {
  if (!analysis || !analysis.generated_at) return false;
  const generatedAt = new Date(analysis.generated_at).getTime();
  if (!Number.isFinite(generatedAt)) return false;
  const now = Date.now();
  const ageMs = now - generatedAt;
  return ageMs >= 0 && ageMs < days * 24 * 60 * 60 * 1000;
}

function shapeAnalysis(record) {
  return {
    id: record.id,
    tenant_id: record.tenant_id,
    studentId: record.studentId,
    score: record.score,
    level: record.level,
    factors: record.factors ? { ...record.factors } : null,
    summary: record.summary,
    generatedByUserId: record.generatedByUserId,
    aiProvider: record.aiProvider,
    generated_at: record.generated_at
  };
}

class DropoutRiskAnalysesStore {
  constructor({ analyses = [] } = {}) {
    this.analyses = analyses.map((a) => ({
      ...a,
      factors: a.factors ? { ...a.factors } : null
    }));
  }

  list(tenantId, { studentId, minLevel } = {}) {
    const minIndex = minLevel ? RISK_LEVELS.indexOf(minLevel) : -1;
    return this.analyses
      .filter((a) => {
        if (a.tenant_id !== tenantId) return false;
        if (studentId && a.studentId !== studentId) return false;
        if (minIndex >= 0) {
          const idx = RISK_LEVELS.indexOf(a.level);
          if (idx < minIndex) return false;
        }
        return true;
      })
      .map(shapeAnalysis)
      .sort((a, b) => (a.generated_at < b.generated_at ? 1 : -1));
  }

  getLatest(tenantId, studentId) {
    const candidates = this.list(tenantId, { studentId });
    return candidates[0] || null;
  }

  create(tenantId, {
    studentId,
    score,
    level,
    factors,
    summary,
    generatedByUserId,
    aiProvider
  }) {
    if (typeof studentId !== 'string' || studentId.length < 2) {
      throw buildValidationError('studentId is required');
    }
    if (!Number.isInteger(score) || score < 0 || score > 100) {
      throw buildValidationError('score must be an integer between 0 and 100');
    }
    if (!RISK_LEVELS.includes(level)) {
      throw buildValidationError(`level must be one of: ${RISK_LEVELS.join(', ')}`);
    }
    if (typeof summary !== 'string' || summary.trim().length === 0) {
      throw buildValidationError('summary is required');
    }
    if (summary.length > MAX_SUMMARY_LENGTH) {
      throw buildValidationError(`summary must be at most ${MAX_SUMMARY_LENGTH} characters`);
    }
    if (typeof generatedByUserId !== 'string' || generatedByUserId.length < 2) {
      throw buildValidationError('generatedByUserId is required');
    }
    if (typeof aiProvider !== 'string' || aiProvider.length < 2) {
      throw buildValidationError('aiProvider is required');
    }
    const created = {
      id: `dropout-risk-${crypto.randomUUID()}`,
      tenant_id: tenantId,
      studentId,
      score,
      level,
      factors: factors ? { ...factors } : null,
      summary: summary.trim(),
      generatedByUserId,
      aiProvider,
      generated_at: new Date().toISOString()
    };
    this.analyses.push(created);
    return shapeAnalysis(created);
  }
}

module.exports = {
  DropoutRiskAnalysesStore,
  RISK_LEVELS,
  RISK_LEVEL_LABELS_FR,
  RISK_LEVEL_BADGES,
  SCORING_WEIGHTS,
  SCORE_CAPS,
  RISK_THRESHOLDS,
  ANALYSIS_FRESHNESS_DAYS,
  MAX_SUMMARY_LENGTH,
  computeOverallAverageForTerm,
  computeTermAverages,
  computeStudentRiskFactors,
  computeRiskScore,
  categorizeRisk,
  buildAnalysisPromptInput,
  isFresh,
  shapeAnalysis
};
