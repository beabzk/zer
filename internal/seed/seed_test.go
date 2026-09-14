package seed

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
	"unicode"

	"github.com/beabzk/zer/internal/database"
	"github.com/beabzk/zer/internal/lineage"
)

func stubHash(password string) (string, error) {
	return "hash:" + password, nil
}

func seedManager(t *testing.T) *database.Manager {
	t.Helper()
	dir := filepath.Join("..", "..", "data", "testscratch",
		fmt.Sprintf("%s-%d", t.Name(), time.Now().UnixNano()))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })
	m := database.NewManager(dir)
	t.Cleanup(func() { m.Close() })
	return m
}

func TestDemoPasswordMeetsPolicy(t *testing.T) {
	if len(DemoPassword) < 8 {
		t.Error("demo password shorter than the 8-character minimum")
	}
	var upper, digit bool
	for _, r := range DemoPassword {
		if unicode.IsUpper(r) {
			upper = true
		}
		if unicode.IsDigit(r) {
			digit = true
		}
	}
	if !upper || !digit {
		t.Error("demo password needs uppercase and numeric characters")
	}
}

func TestSeedAll(t *testing.T) {
	ctx := context.Background()
	m := seedManager(t)

	report, err := SeedAll(ctx, m, stubHash)
	if err != nil {
		t.Fatal(err)
	}
	if len(report) != 5 {
		t.Fatalf("seeded %d trees, want 5", len(report))
	}

	counts := map[string]map[string]int{
		"haile-lineage":      {"individuals": 10, "parent_child": 12, "unions": 3},
		"senait-line":        {"individuals": 9, "parent_child": 10, "unions": 3},
		"adoptive-household": {"individuals": 9, "parent_child": 11, "unions": 3},
		"blended-remarriage": {"individuals": 9, "parent_child": 8, "unions": 4},
		"sparse-records":     {"individuals": 5, "parent_child": 4, "unions": 0},
	}
	bySlug := make(map[string]string)
	for _, r := range report {
		bySlug[r.Slug] = r.ID
		if r.People != counts[r.Slug]["individuals"] {
			t.Errorf("%s reports %d people", r.Slug, r.People)
		}
	}
	for slug, want := range counts {
		db, err := m.Tree(ctx, bySlug[slug])
		if err != nil {
			t.Fatal(err)
		}
		for table, n := range want {
			var got int
			if err := db.QueryRowContext(ctx,
				`SELECT COUNT(*) FROM `+table).Scan(&got); err != nil {
				t.Fatal(err)
			}
			if got != n {
				t.Errorf("%s.%s = %d, want %d", slug, table, got, n)
			}
		}
	}

	// Name synthesis across naming modes.
	db, err := m.Tree(ctx, bySlug["haile-lineage"])
	if err != nil {
		t.Fatal(err)
	}
	got, err := lineage.SynthesizeFullName(ctx, db, "haile-lineage-yared", 4, lineage.ScriptLatin, false)
	if err != nil {
		t.Fatal(err)
	}
	if got != "Yared Abebe Girma Haile" {
		t.Errorf("patronymic chain = %q", got)
	}

	// Reruns abort on the taken slug before writing anything.
	if _, err := SeedAll(ctx, m, stubHash); err == nil {
		t.Error("expected slug collision error on reseed")
	} else if !strings.Contains(err.Error(), "already exists") {
		t.Errorf("unexpected reseed error: %v", err)
	}
}

func TestSeedOwners(t *testing.T) {
	ctx := context.Background()
	m := seedManager(t)

	if _, err := SeedAll(ctx, m, stubHash); err != nil {
		t.Fatal(err)
	}
	master, err := m.Master(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var users int
	if err := master.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM users WHERE email LIKE '%@demo.example.com'`).Scan(&users); err != nil {
		t.Fatal(err)
	}
	if users != 5 {
		t.Errorf("demo owners = %d, want 5", users)
	}
	var owners int
	if err := master.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM tree_members WHERE role = 'OWNER'`).Scan(&owners); err != nil {
		t.Fatal(err)
	}
	if owners != 5 {
		t.Errorf("owner memberships = %d, want 5", owners)
	}
	var stored string
	if err := master.QueryRowContext(ctx,
		`SELECT password FROM users WHERE email = 'haile@demo.example.com'`).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored != "hash:"+DemoPassword {
		t.Errorf("owner password not hashed: %q", stored)
	}
	var mode string
	if err := master.QueryRowContext(ctx,
		`SELECT signup_mode FROM instance_settings WHERE id = 1`).Scan(&mode); err != nil {
		t.Fatalf("instance settings: %v", err)
	}
	if mode != "OPEN" {
		t.Errorf("demo signup mode = %s, want OPEN", mode)
	}
	var adminEmail string
	if err := master.QueryRowContext(ctx,
		`SELECT u.email FROM instance_admins ia JOIN users u ON u.id = ia.user_id`).Scan(&adminEmail); err != nil {
		t.Fatalf("demo instance admin: %v", err)
	}
	if adminEmail != "haile@demo.example.com" {
		t.Errorf("demo instance admin = %s, want haile@demo.example.com", adminEmail)
	}
}
