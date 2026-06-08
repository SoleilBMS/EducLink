-- Sprint 8 / VS-06 — Statistiques d'absentéisme + seuils d'alerte
-- Une ligne par tenant : seuils customisables au-delà desquels un élève est
-- flaggé "en alerte" sur la page /admin/stats-absences. Si la ligne est absente,
-- l'application utilise DEFAULT_THRESHOLDS (hardcodés côté module).
-- window_days définit la fenêtre glissante par défaut lorsque l'utilisateur
-- n'a pas choisi de trimestre ni de plage personnalisée.

CREATE TABLE IF NOT EXISTS attendance_alert_thresholds (
  tenant_id TEXT PRIMARY KEY,
  absent_threshold INTEGER NOT NULL DEFAULT 5,
  late_threshold INTEGER NOT NULL DEFAULT 3,
  discipline_threshold INTEGER NOT NULL DEFAULT 3,
  window_days INTEGER NOT NULL DEFAULT 30,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
