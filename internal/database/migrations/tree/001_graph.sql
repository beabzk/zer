-- Per-tree family graph. Each tree lives in its own SQLite file.
-- Individuals carry given names only. Full names are derived at runtime.
-- Relationships use parent_child and unions tables exclusively.
CREATE TABLE individuals (
    id TEXT PRIMARY KEY,
    given_name_native TEXT NOT NULL,
    given_name_latin TEXT NOT NULL,
    gender TEXT NOT NULL CHECK(gender IN ('MALE', 'FEMALE')),
    titles TEXT,
    titles_display_enabled INTEGER NOT NULL DEFAULT 1,
    birth_year_ec INTEGER,
    birth_month_ec INTEGER,
    birth_day_ec INTEGER,
    birth_date_gc TEXT,
    birth_place TEXT,
    birth_note TEXT,
    is_deceased INTEGER NOT NULL DEFAULT 0,
    death_year_ec INTEGER,
    death_month_ec INTEGER,
    death_day_ec INTEGER,
    death_date_gc TEXT,
    death_place TEXT,
    death_note TEXT,
    profile_photo_url TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
);
CREATE INDEX idx_indiv_names_native ON individuals(given_name_native);
CREATE INDEX idx_indiv_names_latin ON individuals(given_name_latin);

CREATE TABLE alternate_names (
    id TEXT PRIMARY KEY,
    individual_id TEXT NOT NULL REFERENCES individuals(id) ON DELETE CASCADE,
    name_type TEXT NOT NULL,
    name_native TEXT,
    name_latin TEXT,
    note TEXT
);
CREATE INDEX idx_alt_names_indiv ON alternate_names(individual_id);

CREATE TABLE parent_child (
    id TEXT PRIMARY KEY,
    parent_id TEXT NOT NULL REFERENCES individuals(id) ON DELETE CASCADE,
    child_id TEXT NOT NULL REFERENCES individuals(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL DEFAULT 'BIOLOGICAL'
        CHECK(relationship_type IN ('BIOLOGICAL', 'ADOPTIVE', 'FOSTER')),
    is_name_source INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    UNIQUE(parent_id, child_id),
    CHECK(parent_id != child_id)
);
CREATE INDEX idx_parent_child_parent ON parent_child(parent_id);
CREATE INDEX idx_parent_child_child ON parent_child(child_id);

CREATE TABLE unions (
    id TEXT PRIMARY KEY,
    partner_a_id TEXT NOT NULL REFERENCES individuals(id) ON DELETE CASCADE,
    partner_b_id TEXT NOT NULL REFERENCES individuals(id) ON DELETE CASCADE,
    union_type TEXT NOT NULL DEFAULT 'TRADITIONAL'
        CHECK(union_type IN ('TRADITIONAL', 'RELIGIOUS', 'CIVIL')),
    status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK(status IN ('ACTIVE', 'DISSOLVED', 'WIDOWED')),
    marriage_date_gc TEXT,
    marriage_place TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    CHECK(partner_a_id != partner_b_id)
);
CREATE INDEX idx_unions_partner_a ON unions(partner_a_id);
CREATE INDEX idx_unions_partner_b ON unions(partner_b_id);

CREATE TABLE individual_events (
    id TEXT PRIMARY KEY,
    individual_id TEXT NOT NULL REFERENCES individuals(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    event_date_gc TEXT,
    event_year_ec INTEGER,
    event_place TEXT,
    description TEXT
);
CREATE INDEX idx_indiv_events_indiv ON individual_events(individual_id);
