const { buildValidationError } = require('./error-utils');

const DEFAULT_THRESHOLDS = Object.freeze({
  absentThreshold: 5,
  lateThreshold: 3,
  disciplineThreshold: 3,
  windowDays: 30
});

const THRESHOLD_FIELD_LABELS_FR = Object.freeze({
  absentThreshold: 'Absences non justifiées',
  lateThreshold: 'Retards',
  disciplineThreshold: 'Mesures disciplinaires',
  windowDays: 'Fenêtre glissante (jours)'
});

const THRESHOLD_LIMITS = Object.freeze({
  absentThreshold: { min: 1, max: 100 },
  lateThreshold: { min: 1, max: 100 },
  disciplineThreshold: { min: 1, max: 100 },
  windowDays: { min: 1, max: 365 }
});

function normalizeThresholdValue(field, value) {
  if (value === undefined || value === null || value === '') {
    throw buildValidationError(`${field} is required`);
  }
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed)) {
    throw buildValidationError(`${field} must be an integer`);
  }
  const { min, max } = THRESHOLD_LIMITS[field];
  if (parsed < min || parsed > max) {
    throw buildValidationError(`${field} must be between ${min} and ${max}`);
  }
  return parsed;
}

function normalizeThresholds(input) {
  return {
    absentThreshold: normalizeThresholdValue('absentThreshold', input.absentThreshold),
    lateThreshold: normalizeThresholdValue('lateThreshold', input.lateThreshold),
    disciplineThreshold: normalizeThresholdValue('disciplineThreshold', input.disciplineThreshold),
    windowDays: normalizeThresholdValue('windowDays', input.windowDays)
  };
}

class AlertThresholdsStore {
  constructor({ rows = [] } = {}) {
    this.rows = new Map(rows.map((r) => [r.tenant_id, { ...r }]));
  }

  get(tenantId) {
    const existing = this.rows.get(tenantId);
    if (!existing) {
      return { ...DEFAULT_THRESHOLDS, tenant_id: tenantId, isDefault: true };
    }
    return {
      tenant_id: tenantId,
      absentThreshold: existing.absentThreshold,
      lateThreshold: existing.lateThreshold,
      disciplineThreshold: existing.disciplineThreshold,
      windowDays: existing.windowDays,
      isDefault: false,
      updated_at: existing.updated_at
    };
  }

  upsert(tenantId, input) {
    const normalized = normalizeThresholds(input);
    const now = new Date().toISOString();
    const stored = {
      tenant_id: tenantId,
      ...normalized,
      updated_at: now
    };
    this.rows.set(tenantId, stored);
    return { ...stored, isDefault: false };
  }
}

function inRange(dateString, from, to) {
  if (!dateString) return false;
  if (from && dateString < from) return false;
  if (to && dateString > to) return false;
  return true;
}

function computeStudentAbsenceStats({
  students = [],
  attendanceRecords = [],
  disciplineRecords = [],
  from,
  to
} = {}) {
  const init = new Map();
  for (const student of students) {
    init.set(student.id, {
      studentId: student.id,
      classRoomId: student.classRoomId,
      absentCount: 0,
      excusedCount: 0,
      lateCount: 0,
      disciplineCount: 0,
      totalAbsence: 0,
      hoursMissed: null
    });
  }

  for (const record of attendanceRecords) {
    if (!init.has(record.studentId)) continue;
    if (!inRange(record.date, from, to)) continue;
    const entry = init.get(record.studentId);
    if (record.status === 'absent') entry.absentCount += 1;
    else if (record.status === 'excused') entry.excusedCount += 1;
    else if (record.status === 'late') entry.lateCount += 1;
  }

  for (const record of disciplineRecords) {
    if (!init.has(record.studentId)) continue;
    if (!inRange(record.occurredOn, from, to)) continue;
    const entry = init.get(record.studentId);
    entry.disciplineCount += 1;
  }

  for (const entry of init.values()) {
    entry.totalAbsence = entry.absentCount + entry.excusedCount;
  }

  return [...init.values()];
}

function pickTopAbsent(stats, limit = 10) {
  return [...stats]
    .filter((s) => s.totalAbsence > 0)
    .sort((a, b) => (
      b.totalAbsence - a.totalAbsence
      || b.absentCount - a.absentCount
      || (a.studentId < b.studentId ? -1 : 1)
    ))
    .slice(0, limit);
}

function pickTopLate(stats, limit = 10) {
  return [...stats]
    .filter((s) => s.lateCount > 0)
    .sort((a, b) => (
      b.lateCount - a.lateCount
      || (a.studentId < b.studentId ? -1 : 1)
    ))
    .slice(0, limit);
}

function pickTopDiscipline(stats, limit = 5) {
  return [...stats]
    .filter((s) => s.disciplineCount > 0)
    .sort((a, b) => (
      b.disciplineCount - a.disciplineCount
      || (a.studentId < b.studentId ? -1 : 1)
    ))
    .slice(0, limit);
}

function markAlerts(stats, thresholds) {
  return stats.map((entry) => {
    const isAbsentAlert = entry.absentCount >= thresholds.absentThreshold;
    const isLateAlert = entry.lateCount >= thresholds.lateThreshold;
    const isDisciplineAlert = entry.disciplineCount >= thresholds.disciplineThreshold;
    return {
      ...entry,
      isAbsentAlert,
      isLateAlert,
      isDisciplineAlert,
      isAnyAlert: isAbsentAlert || isLateAlert || isDisciplineAlert
    };
  });
}

function findCurrentTermId(terms, today) {
  if (!Array.isArray(terms) || terms.length === 0) return null;
  const sameTenant = terms;
  const within = sameTenant.find((t) => {
    const start = t.starts_at || t.start_date;
    const end = t.ends_at || t.end_date;
    return start && end && today >= start && today <= end;
  });
  if (within) return within.id;
  // fallback : le plus récent dont start <= today
  const past = sameTenant
    .filter((t) => (t.starts_at || t.start_date) <= today)
    .sort((a, b) => (b.starts_at || b.start_date).localeCompare(a.starts_at || a.start_date));
  return past[0]?.id ?? sameTenant[sameTenant.length - 1].id;
}

function resolveTermById(terms, termId) {
  if (!termId) return null;
  return terms.find((t) => t.id === termId) || null;
}

module.exports = {
  AlertThresholdsStore,
  DEFAULT_THRESHOLDS,
  THRESHOLD_FIELD_LABELS_FR,
  THRESHOLD_LIMITS,
  normalizeThresholds,
  computeStudentAbsenceStats,
  pickTopAbsent,
  pickTopLate,
  pickTopDiscipline,
  markAlerts,
  findCurrentTermId,
  resolveTermById
};
