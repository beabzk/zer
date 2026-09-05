-- Zer tree registry. Lives in master.sqlite next to the Limen tables.
-- User references are plain INTEGER values matching Limen users(id).
-- No foreign key points at Limen tables so registry migrations stay
-- independent of Limen schema changes.
CREATE TABLE trees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    default_lang TEXT NOT NULL DEFAULT 'en',
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
);
CREATE INDEX idx_trees_created_by ON trees(created_by);

CREATE TABLE tree_members (
    id TEXT PRIMARY KEY,
    tree_id TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    UNIQUE(tree_id, user_id)
);
CREATE INDEX idx_tree_members_user ON tree_members(user_id);
