-- Signup access state belongs to the instance.
CREATE TABLE instance_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    signup_mode TEXT NOT NULL CHECK (signup_mode IN ('OPEN', 'INVITE', 'CLOSED')),
    default_invite_expiry_hours INTEGER NOT NULL
        CHECK (default_invite_expiry_hours BETWEEN 1 AND 720),
    setup_completed_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE instance_admins (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE signup_invites (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL COLLATE NOCASE,
    token_hash TEXT NOT NULL UNIQUE,
    invited_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    accepted_at TEXT,
    accepted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    revoked_at TEXT,
    reserved_at TEXT,
    reserved_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX idx_signup_invites_active_email
ON signup_invites(email)
WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX idx_signup_invites_invited_by ON signup_invites(invited_by);
CREATE INDEX idx_signup_invites_accepted_by ON signup_invites(accepted_by);

-- Instances that already have users are migrated as invite-only. Existing
-- ADMIN_EMAILS operators retain access without a database admin row.
INSERT INTO instance_settings (
    id, signup_mode, default_invite_expiry_hours,
    setup_completed_at, updated_at
)
SELECT 1, 'INVITE', 168,
    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE EXISTS (SELECT 1 FROM users);
