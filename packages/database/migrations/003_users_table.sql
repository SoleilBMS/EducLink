CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_users_email_lower UNIQUE (email),
  CONSTRAINT chk_users_role CHECK (role IN (
    'super_admin', 'school_admin', 'director', 'teacher', 'parent', 'student', 'accountant'
  )),
  CONSTRAINT chk_users_tenant_for_role CHECK (
    (role = 'super_admin' AND tenant_id IS NULL)
    OR (role <> 'super_admin' AND tenant_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_tenant_role ON users (tenant_id, role);
