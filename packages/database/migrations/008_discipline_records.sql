-- Sprint 8 / VS-05 — Module discipline (observations, retenues, exclusions,
-- convocations parents). Module structuré qui complète (sans remplacer) les
-- attendance_events.event_type='punition' introduits en VS-01 — ces derniers
-- restent pour les observations comportementales courtes sans date d'exécution.

CREATE TABLE IF NOT EXISTS discipline_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  recorded_by_user_id TEXT NOT NULL,
  recorded_by_role TEXT NOT NULL,
  measure_type TEXT NOT NULL,
  occurred_on TEXT NOT NULL,
  scheduled_for TEXT,
  duration_minutes INTEGER,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_discipline_records_tenant_student
  ON discipline_records (tenant_id, student_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_discipline_records_tenant_recent
  ON discipline_records (tenant_id, occurred_on DESC);
