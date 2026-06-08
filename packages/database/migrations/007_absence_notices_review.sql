-- Sprint 8 / VS-04 — Workflow validation des justificatifs d'absence
-- Ajoute les 3 colonnes nécessaires pour tracer la décision admin
-- (approve / reject) sur une notice créée par un parent en VS-03.
-- L'index existant idx_absence_notices_tenant_status (tenant_id, status,
-- created_at DESC) couvre déjà la requête "notices en attente du tenant".

ALTER TABLE absence_notices
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_comment TEXT;
