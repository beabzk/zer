-- Limen Auth core tables. Limen does not run migrations itself, so zer
-- owns this DDL. Column names and types mirror the Limen schema
-- definitions for the default configuration: integer autoincrement ids,
-- TEXT storage for timestamps, no soft delete column.
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    password TEXT,
    email_verified_at TEXT,
    first_name TEXT,
    last_name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_users_email ON users(email);

CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_access TEXT NOT NULL,
    metadata TEXT
);
CREATE UNIQUE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

CREATE TABLE verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_verifications_value ON verifications(value);
CREATE INDEX idx_verifications_subject ON verifications(subject);

CREATE TABLE rate_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    count INTEGER NOT NULL,
    last_request_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_rate_limits_key ON rate_limits(key);

CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    provider TEXT NOT NULL,
    provider_account_id TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    access_token_expires_at TEXT,
    scope TEXT NOT NULL,
    id_token TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_accounts_user_id ON accounts(user_id);
CREATE UNIQUE INDEX idx_accounts_provider_provider_account_id ON accounts(provider, provider_account_id);
