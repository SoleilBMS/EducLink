-- Sprint Klassly-feed — fil d'actualite visuel par classe
-- 5 tables : posts (avec soft-delete), attachments (BYTEA photos),
-- comments (plat), likes (composite PK), reads (composite PK).
-- Pattern existant : index partiels sur deleted_at, BYTEA pour fichiers (cf 006_absence_notices).

CREATE TABLE IF NOT EXISTS class_feed_posts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  class_room_id TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cfp_class_recent
  ON class_feed_posts (tenant_id, class_room_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cfp_broadcast_recent
  ON class_feed_posts (tenant_id, created_at DESC)
  WHERE class_room_id IS NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS class_feed_post_attachments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES class_feed_posts(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  data BYTEA NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cfp_attachments_post
  ON class_feed_post_attachments (post_id, position);

CREATE TABLE IF NOT EXISTS class_feed_post_comments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  post_id TEXT NOT NULL REFERENCES class_feed_posts(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cfp_comments_post
  ON class_feed_post_comments (post_id, created_at);

CREATE TABLE IF NOT EXISTS class_feed_post_likes (
  post_id TEXT NOT NULL REFERENCES class_feed_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS class_feed_post_reads (
  post_id TEXT NOT NULL REFERENCES class_feed_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_cfp_reads_post
  ON class_feed_post_reads (post_id);
