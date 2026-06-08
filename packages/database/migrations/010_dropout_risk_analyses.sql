-- Sprint 8 / VS-07 — Détection décrocheurs IA
-- Persiste les analyses de risque générées par AiService (synthèses 4 phrases
-- destinées au CPE). Le scoring lui-même est déterministe (cf dropout-risk.js)
-- et recalculé à la volée — on ne stocke ici que les résumés IA + le snapshot
-- des facteurs au moment de la génération, pour avoir un historique consultable
-- et permettre un cache 7 jours (évite de payer le call IA à chaque clic).

CREATE TABLE IF NOT EXISTS dropout_risk_analyses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  level TEXT NOT NULL,
  factors_json TEXT NOT NULL,
  summary TEXT NOT NULL,
  generated_by_user_id TEXT NOT NULL,
  ai_provider TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dropout_risk_tenant_student_generated
  ON dropout_risk_analyses (tenant_id, student_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_dropout_risk_tenant_generated
  ON dropout_risk_analyses (tenant_id, generated_at DESC);
