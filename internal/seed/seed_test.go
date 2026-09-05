package seed

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/beabzk/zer/internal/database"
	"github.com/beabzk/zer/internal/lineage"
)

func seedManager(t *testing.T) (*database.Manager, int64) {
	t.Helper()
	dir := filepath.Join("..", "..", "data", "testscratch",
		fmt.Sprintf("%s-%d", t.Name(), time.Now().UnixNano()))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })

	m := database.NewManager(dir)
	t.Cleanup(func() { m.Close() })
	master, err := m.Master(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	res, err := master.ExecContext(context.Background(),
		`INSERT INTO users (email, created_at, updated_at) VALUES ('seed@example.com', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`)
	if err != nil {
		t.Fatal(err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		t.Fatal(err)
	}
	return m, id
}

func count(t *testing.T, m *database.Manager, treeID, table string) int {
	t.Helper()
	db, err := m.Tree(context.Background(), treeID)
	if err != nil {
		t.Fatal(err)
	}
	var n int
	if err := db.QueryRowContext(context.Background(),
		`SELECT COUNT(*) FROM `+table).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestDemoTree(t *testing.T) {
	ctx := context.Background()
	m, userID := seedManager(t)

	treeID, err := DemoTree(ctx, m, userID, "Demo", "demo")
	if err != nil {
		t.Fatal(err)
	}
	if n := count(t, m, treeID, "individuals"); n != 10 {
		t.Errorf("individuals = %d, want 10", n)
	}
	if n := count(t, m, treeID, "parent_child"); n != 10 {
		t.Errorf("edges = %d, want 10", n)
	}
	if n := count(t, m, treeID, "unions"); n != 4 {
		t.Errorf("unions = %d, want 4", n)
	}
	if n := count(t, m, treeID, "alternate_names"); n != 2 {
		t.Errorf("alternate names = %d, want 2", n)
	}
	if n := count(t, m, treeID, "individual_events"); n != 2 {
		t.Errorf("events = %d, want 2", n)
	}

	db, err := m.Tree(ctx, treeID)
	if err != nil {
		t.Fatal(err)
	}
	for id, want := range map[string]string{
		"demo-hana":    "Hana Kebede Tesfaye",
		"demo-dawit":   "Dawit Tigist",
		"demo-yonas":   "Yonas Kebede Tesfaye",
		"demo-selam":   "Selam",
		"demo-tesfaye": "Tesfaye",
	} {
		got, err := lineage.SynthesizeFullName(ctx, db, id, 3, lineage.ScriptLatin, false)
		if err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Errorf("%s = %q, want %q", id, got, want)
		}
	}

	if _, err := DemoTree(ctx, m, userID, "Demo Again", "demo"); err == nil {
		t.Error("expected error for duplicate slug")
	}
}
