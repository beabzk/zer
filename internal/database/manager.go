// Package database owns SQLite storage for zer: one master database for
// Limen Auth state plus the tree registry, and one isolated database per
// family tree. All access goes through Manager.
package database

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	_ "modernc.org/sqlite"
)

//go:embed migrations/master/*.sql migrations/tree/*.sql
var migrationFS embed.FS

const (
	masterFileName = "master.sqlite"
	treesDirName   = "trees"
)

// Manager opens and caches SQLite handles. The zero value is not usable,
// use NewManager. Manager is safe for concurrent use.
type Manager struct {
	baseDir string

	mu     sync.Mutex
	master *sql.DB
	trees  map[string]*sql.DB
}

// NewManager returns a Manager rooted at baseDir. Database files are created
// under baseDir on first use. Production layout keeps baseDir at ./data.
func NewManager(baseDir string) *Manager {
	return &Manager{baseDir: baseDir, trees: make(map[string]*sql.DB)}
}

// Master opens data/master.sqlite (Limen tables plus tree registry),
// applies pending master migrations, and returns the shared handle.
func (m *Manager) Master(ctx context.Context) (*sql.DB, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.master != nil {
		return m.master, nil
	}
	if err := ensureDir(m.baseDir); err != nil {
		return nil, err
	}
	db, err := openDB(filepath.Join(m.baseDir, masterFileName))
	if err != nil {
		return nil, err
	}
	if err := applyMigrations(ctx, db, "migrations/master"); err != nil {
		db.Close()
		return nil, fmt.Errorf("master migrations: %w", err)
	}
	m.master = db
	return db, nil
}

// Tree opens data/trees/{treeID}.sqlite, applies pending tree migrations,
// and returns a cached handle. treeID allows letters, digits, and hyphens
// only, which keeps paths inside the trees directory.
func (m *Manager) Tree(ctx context.Context, treeID string) (*sql.DB, error) {
	if !validTreeID(treeID) {
		return nil, fmt.Errorf("invalid tree id %q", treeID)
	}
	m.mu.Lock()
	defer m.mu.Unlock()

	if db, ok := m.trees[treeID]; ok {
		return db, nil
	}
	dir := filepath.Join(m.baseDir, treesDirName)
	if err := ensureDir(dir); err != nil {
		return nil, err
	}
	db, err := openDB(filepath.Join(dir, treeID+".sqlite"))
	if err != nil {
		return nil, err
	}
	if err := applyMigrations(ctx, db, "migrations/tree"); err != nil {
		db.Close()
		return nil, fmt.Errorf("tree %s migrations: %w", treeID, err)
	}
	m.trees[treeID] = db
	return db, nil
}

// DropTree closes the cached handle for a tree and deletes its database
// files. Registry rows are removed by the caller.
func (m *Manager) DropTree(treeID string) error {
	if !validTreeID(treeID) {
		return fmt.Errorf("invalid tree id %q", treeID)
	}
	m.mu.Lock()
	defer m.mu.Unlock()

	if db, ok := m.trees[treeID]; ok {
		if err := db.Close(); err != nil {
			return err
		}
		delete(m.trees, treeID)
	}
	base := filepath.Join(m.baseDir, treesDirName, treeID)
	var errs []string
	for _, suffix := range []string{".sqlite", ".sqlite-wal", ".sqlite-shm", ".sqlite-journal"} {
		if err := os.Remove(base + suffix); err != nil && !os.IsNotExist(err) {
			errs = append(errs, err.Error())
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("drop tree %s: %s", treeID, strings.Join(errs, "; "))
	}
	return nil
}

// Close releases the master handle and every cached tree handle.
func (m *Manager) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	var errs []string
	if m.master != nil {
		if err := m.master.Close(); err != nil {
			errs = append(errs, err.Error())
		}
		m.master = nil
	}
	for id, db := range m.trees {
		if err := db.Close(); err != nil {
			errs = append(errs, id+": "+err.Error())
		}
		delete(m.trees, id)
	}
	if len(errs) > 0 {
		return fmt.Errorf("close: %s", strings.Join(errs, "; "))
	}
	return nil
}

func openDB(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	// Single connection keeps the memory footprint low and serializes
	// SQLite writes without external locking.
	db.SetMaxOpenConns(1)
	if _, err := db.Exec("PRAGMA journal_mode = WAL"); err != nil {
		db.Close()
		return nil, err
	}
	if _, err := db.Exec("PRAGMA foreign_keys = ON"); err != nil {
		db.Close()
		return nil, err
	}
	if _, err := db.Exec("PRAGMA busy_timeout = 5000"); err != nil {
		db.Close()
		return nil, err
	}
	if _, err := db.Exec("PRAGMA synchronous = NORMAL"); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

func applyMigrations(ctx context.Context, db *sql.DB, dir string) error {
	if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS _migrations (
		name TEXT PRIMARY KEY,
		applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
	)`); err != nil {
		return err
	}
	entries, err := fs.ReadDir(migrationFS, dir)
	if err != nil {
		return err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)

	applied := make(map[string]bool)
	rows, err := db.QueryContext(ctx, `SELECT name FROM _migrations`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return err
		}
		applied[name] = true
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for _, name := range names {
		if applied[name] {
			continue
		}
		raw, err := fs.ReadFile(migrationFS, dir+"/"+name)
		if err != nil {
			return err
		}
		if err := applyFile(ctx, db, string(raw)); err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		if _, err := db.ExecContext(ctx, `INSERT INTO _migrations (name) VALUES (?)`, name); err != nil {
			return err
		}
	}
	return nil
}

// applyFile runs each semicolon-terminated statement in its own Exec.
// Migration files avoid semicolons inside string literals. Comment-only
// fragments carry no statement and are skipped.
func applyFile(ctx context.Context, db *sql.DB, content string) error {
	for _, part := range strings.Split(content, ";") {
		stmt := strings.TrimSpace(stripCommentLines(part))
		if stmt == "" {
			continue
		}
		if _, err := db.ExecContext(ctx, stmt); err != nil {
			return err
		}
	}
	return nil
}

func stripCommentLines(s string) string {
	var kept []string
	for _, line := range strings.Split(s, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "--") {
			continue
		}
		kept = append(kept, line)
	}
	return strings.Join(kept, "\n")
}

func ensureDir(dir string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create dir %s: %w", dir, err)
	}
	return nil
}

func validTreeID(id string) bool {
	if id == "" || len(id) > 64 {
		return false
	}
	for _, r := range id {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' {
			continue
		}
		return false
	}
	return true
}
