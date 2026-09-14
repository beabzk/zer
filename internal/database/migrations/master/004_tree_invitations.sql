-- Tree access invitations live with the registry because they control
-- membership rather than family graph data.
CREATE TABLE tree_invitations (
    id TEXT PRIMARY KEY,
    tree_id TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL COLLATE NOCASE,
    role TEXT NOT NULL CHECK(role IN ('ADMIN', 'EDITOR', 'VIEWER')),
    token_hash TEXT NOT NULL UNIQUE,
    invited_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    accepted_at TEXT,
    accepted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    revoked_at TEXT
);

CREATE UNIQUE INDEX idx_tree_invitations_active_user
ON tree_invitations(tree_id, user_id)
WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX idx_tree_invitations_tree ON tree_invitations(tree_id, created_at);
