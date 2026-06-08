-- Sprint 8 / VS-03 — Parent prévient absence + upload justificatif
-- Table absence_notices : intention déclarée par un parent, indépendante
-- d'attendance_records. Statut initial 'pending' ; VS-04 fera passer à
-- 'approved' / 'rejected' et synchronisera attendance_records.
-- Le justificatif (PDF / PNG / JPG, 3 Mo max) est stocké en BYTEA pour
-- éviter toute infra disque / S3 dans cette première itération.

CREATE TABLE IF NOT EXISTS absence_notices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  document_file_name TEXT,
  document_mime_type TEXT,
  document_data BYTEA,
  document_size_bytes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_absence_notices_tenant_status
  ON absence_notices (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_absence_notices_tenant_student
  ON absence_notices (tenant_id, student_id, start_date DESC);
