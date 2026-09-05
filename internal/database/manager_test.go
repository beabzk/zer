package database

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// scratchDir returns a unique directory under the repo data folder for test
// databases. System temp stays untouched.
func scratchDir(t *testing.T) string {
	t.Helper()
	dir := filepath.Join("..", "..", "data", "testscratch",
		fmt.Sprintf("%s-%d", t.Name(), time.Now().UnixNano()))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })
	return dir
}

func collectTables(t *testing.T, ctx context.Context, db *sql.DB) map[string]bool {
	t.Helper()
	rows, err := db.QueryContext(ctx, `SELECT name FROM sqlite_master WHERE type = 'table'`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	out := make(map[string]bool)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatal(err)
		}
		out[name] = true
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	return out
}

func pragma(t *testing.T, ctx context.Context, db *sql.DB, name string) string {
	t.Helper()
	var value string
	if err := db.QueryRowContext(ctx, `PRAGMA `+name).Scan(&value); err != nil {
		t.Fatal(err)
	}
	return value
}

func TestMasterCreatesLimenAndRegistryTables(t *testing.T) {
	ctx := context.Background()
	m := NewManager(scratchDir(t))
	defer m.Close()

	db, err := m.Master(ctx)
	if err != nil {
		t.Fatal(err)
	}
	tables := collectTables(t, ctx, db)
	for _, want := range []string{
		"users", "sessions", "verifications", "rate_limits", "accounts",
		"trees", "tree_members", "_migrations",
	} {
		if !tables[want] {
			t.Errorf("master missing table %s", want)
		}
	}
	if got := pragma(t, ctx, db, "journal_mode"); got != "wal" {
		t.Errorf("journal_mode = %s, want wal", got)
	}
	if got := pragma(t, ctx, db, "foreign_keys"); got != "1" {
		t.Errorf("foreign_keys = %s, want 1", got)
	}
}

func TestTreeCreatesGraphTables(t *testing.T) {
	ctx := context.Background()
	m := NewManager(scratchDir(t))
	defer m.Close()

	db, err := m.Tree(ctx, "zikie-lineage")
	if err != nil {
		t.Fatal(err)
	}
	tables := collectTables(t, ctx, db)
	for _, want := range []string{
		"individuals", "alternate_names", "parent_child",
		"unions", "individual_events", "_migrations",
	} {
		if !tables[want] {
			t.Errorf("tree missing table %s", want)
		}
	}
	if tables["users"] || tables["trees"] {
		t.Error("tree database must not hold master tables")
	}
}

func TestTreeHandleIsCached(t *testing.T) {
	ctx := context.Background()
	m := NewManager(scratchDir(t))
	defer m.Close()

	first, err := m.Tree(ctx, "abc-123")
	if err != nil {
		t.Fatal(err)
	}
	second, err := m.Tree(ctx, "abc-123")
	if err != nil {
		t.Fatal(err)
	}
	if first != second {
		t.Error("expected cached handle for repeated Tree call")
	}
}

func TestTreeRejectsBadIDs(t *testing.T) {
	ctx := context.Background()
	m := NewManager(scratchDir(t))
	defer m.Close()

	for _, id := range []string{"", "../evil", "a/b", "x.sqlite", "a b", "tree\x00"} {
		if _, err := m.Tree(ctx, id); err == nil {
			t.Errorf("expected error for tree id %q", id)
		}
	}
}

func TestTreesAreIsolated(t *testing.T) {
	ctx := context.Background()
	m := NewManager(scratchDir(t))
	defer m.Close()

	a, err := m.Tree(ctx, "tree-a")
	if err != nil {
		t.Fatal(err)
	}
	b, err := m.Tree(ctx, "tree-b")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := a.ExecContext(ctx, `INSERT INTO individuals (id, given_name_native, given_name_latin, gender)
		VALUES ('p1', 'native', 'latin', 'MALE')`); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := b.QueryRowContext(ctx, `SELECT COUNT(*) FROM individuals`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Errorf("tree-b sees %d rows from tree-a, want isolation", count)
	}
}

func TestRegistryRoundTripAndCascade(t *testing.T) {
	ctx := context.Background()
	m := NewManager(scratchDir(t))
	defer m.Close()

	db, err := m.Master(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO trees (id, name, slug, created_by)
		VALUES ('t1', 'Zikie', 'zikie-lineage', 7)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO tree_members (id, tree_id, user_id, role)
		VALUES ('m1', 't1', 7, 'OWNER')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO tree_members (id, tree_id, user_id, role)
		VALUES ('m2', 't1', 7, 'VIEWER')`); err == nil {
		t.Error("expected unique violation for duplicate tree member")
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO tree_members (id, tree_id, user_id, role)
		VALUES ('m3', 't1', 8, 'CHIEF')`); err == nil {
		t.Error("expected check violation for unknown role")
	}
	if _, err := db.ExecContext(ctx, `DELETE FROM trees WHERE id = 't1'`); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM tree_members`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Errorf("members remain after tree delete: %d", count)
	}
}

func TestMigrationsAreIdempotent(t *testing.T) {
	ctx := context.Background()
	dir := scratchDir(t)

	m := NewManager(dir)
	if _, err := m.Master(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := m.Tree(ctx, "redo"); err != nil {
		t.Fatal(err)
	}
	if err := m.Close(); err != nil {
		t.Fatal(err)
	}

	m2 := NewManager(dir)
	defer m2.Close()
	if _, err := m2.Master(ctx); err != nil {
		t.Fatalf("reopen master: %v", err)
	}
	if _, err := m2.Tree(ctx, "redo"); err != nil {
		t.Fatalf("reopen tree: %v", err)
	}
}
