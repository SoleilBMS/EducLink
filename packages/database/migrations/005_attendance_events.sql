-- Sprint 8 / VS-01 — Feuille d'appel enrichie
-- Ajoute la table attendance_events pour capturer en marge de l'appel
-- les passages infirmerie, observations, encouragements et sanctions.
-- Le statut 'excused' (absent justifié) est désormais accepté côté application
-- pour distinguer un absent justifié d'un absent non justifié.

CREATE TABLE IF NOT EXISTS attendance_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  date TEXT NOT NULL,
  class_room_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  recorded_by_user_id TEXT NOT NULL,
  recorded_by_role TEXT NOT NULL,
  event_type TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_attendance_events_tenant_date ON attendance_events (tenant_id, date, class_room_id);
CREATE INDEX IF NOT EXISTS idx_attendance_events_student ON attendance_events (tenant_id, student_id, date DESC);
