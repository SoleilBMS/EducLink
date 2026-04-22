CREATE TABLE IF NOT EXISTS class_rooms (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  grade_level_id TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_class_rooms_tenant ON class_rooms (tenant_id);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  admission_number TEXT NOT NULL,
  class_room_id TEXT NOT NULL,
  date_of_birth TEXT NOT NULL DEFAULT '',
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_students_class_room FOREIGN KEY (class_room_id) REFERENCES class_rooms (id) ON DELETE RESTRICT,
  CONSTRAINT uq_students_tenant_admission UNIQUE (tenant_id, admission_number)
);

CREATE INDEX IF NOT EXISTS idx_students_tenant ON students (tenant_id);
CREATE INDEX IF NOT EXISTS idx_students_tenant_class_room ON students (tenant_id, class_room_id);
