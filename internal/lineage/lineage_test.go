package lineage

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/beabzk/zer/internal/database"
)

func fixtureDB(t *testing.T) *sql.DB {
	t.Helper()
	dir := filepath.Join("..", "..", "data", "testscratch",
		fmt.Sprintf("%s-%d", t.Name(), time.Now().UnixNano()))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })

	m := database.NewManager(dir)
	t.Cleanup(func() { m.Close() })
	db, err := m.Tree(context.Background(), "fixture")
	if err != nil {
		t.Fatal(err)
	}
	return db
}

func addPerson(t *testing.T, db *sql.DB, id, native, latin, gender, titles string) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO individuals (id, given_name_native, given_name_latin, gender, titles)
		VALUES (?, ?, ?, ?, ?)`, id, native, latin, gender, titles); err != nil {
		t.Fatal(err)
	}
}

func addEdge(t *testing.T, db *sql.DB, parent, child, rel string, nameSource int) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO parent_child (id, parent_id, child_id, relationship_type, is_name_source)
		VALUES (?, ?, ?, ?, ?)`, parent+child, parent, child, rel, nameSource); err != nil {
		t.Fatal(err)
	}
}

func seedFamily(t *testing.T, db *sql.DB) {
	t.Helper()
	addPerson(t, db, "gp", "GPn", "GP", "MALE", "")
	addPerson(t, db, "father", "Fn", "F", "MALE", "")
	addPerson(t, db, "mother", "Mn", "M", "FEMALE", "")
	addPerson(t, db, "child", "Cn", "C", "MALE", `["Ato"]`)
	addPerson(t, db, "sib", "Sn", "S", "FEMALE", "")
	addPerson(t, db, "stranger", "Xn", "X", "FEMALE", "")

	addEdge(t, db, "gp", "father", "BIOLOGICAL", 1)
	addEdge(t, db, "father", "child", "BIOLOGICAL", 1)
	addEdge(t, db, "mother", "child", "BIOLOGICAL", 0)
	addEdge(t, db, "father", "sib", "BIOLOGICAL", 1)

	if _, err := db.Exec(`INSERT INTO unions (id, partner_a_id, partner_b_id, union_type, status)
		VALUES ('u1', 'father', 'mother', 'TRADITIONAL', 'ACTIVE')`); err != nil {
		t.Fatal(err)
	}
}

func TestSynthesizePatronymic(t *testing.T) {
	ctx := context.Background()
	db := fixtureDB(t)
	seedFamily(t, db)

	got, err := SynthesizeFullName(ctx, db, "child", 3, ScriptLatin, false)
	if err != nil {
		t.Fatal(err)
	}
	if got != "C F GP" {
		t.Errorf("got %q, want %q", got, "C F GP")
	}
}

func TestSynthesizeDepthAndScript(t *testing.T) {
	ctx := context.Background()
	db := fixtureDB(t)
	seedFamily(t, db)

	cases := []struct {
		depth  int
		script Script
		want   string
	}{
		{1, ScriptLatin, "C"},
		{2, ScriptLatin, "C F"},
		{10, ScriptLatin, "C F GP"},
		{0, ScriptLatin, "C F GP"},
		{3, ScriptNative, "Cn Fn GPn"},
	}
	for _, c := range cases {
		got, err := SynthesizeFullName(ctx, db, "child", c.depth, c.script, false)
		if err != nil {
			t.Fatal(err)
		}
		if got != c.want {
			t.Errorf("depth %d script %s: got %q, want %q", c.depth, c.script, got, c.want)
		}
	}
}

func TestSynthesizeTitles(t *testing.T) {
	ctx := context.Background()
	db := fixtureDB(t)
	seedFamily(t, db)

	got, err := SynthesizeFullName(ctx, db, "child", 3, ScriptLatin, true)
	if err != nil {
		t.Fatal(err)
	}
	if got != "Ato C F GP" {
		t.Errorf("got %q, want %q", got, "Ato C F GP")
	}
}

func TestSynthesizeMatronymic(t *testing.T) {
	ctx := context.Background()
	db := fixtureDB(t)
	seedFamily(t, db)

	addPerson(t, db, "mchild", "MCn", "MC", "FEMALE", "")
	addEdge(t, db, "father", "mchild", "BIOLOGICAL", 0)
	addEdge(t, db, "mother", "mchild", "BIOLOGICAL", 1)

	got, err := SynthesizeFullName(ctx, db, "mchild", 3, ScriptLatin, false)
	if err != nil {
		t.Fatal(err)
	}
	if got != "MC M" {
		t.Errorf("got %q, want %q", got, "MC M")
	}
}

func TestSynthesizeRejectsScriptAndTerminatesOnCycle(t *testing.T) {
	ctx := context.Background()
	db := fixtureDB(t)
	seedFamily(t, db)

	if _, err := SynthesizeFullName(ctx, db, "child", 3, "fidel", false); err == nil {
		t.Error("expected error for unknown script")
	}
	// Bypass validation to plant a cycle, the walk must still terminate.
	addEdge(t, db, "child", "gp", "BIOLOGICAL", 1)
	got, err := SynthesizeFullName(ctx, db, "child", 10, ScriptLatin, false)
	if err != nil {
		t.Fatal(err)
	}
	if got != "C F GP" {
		t.Errorf("cyclic walk gave %q, want %q", got, "C F GP")
	}
}

func TestKinshipPaths(t *testing.T) {
	ctx := context.Background()
	db := fixtureDB(t)
	seedFamily(t, db)

	self, err := FindKinship(ctx, db, "child", "child")
	if err != nil {
		t.Fatal(err)
	}
	if self.PathKey != "self" || self.DegreesOfSep != 0 {
		t.Errorf("self kinship = %+v", self)
	}

	spouses, err := FindKinship(ctx, db, "father", "mother")
	if err != nil {
		t.Fatal(err)
	}
	if spouses.PathKey != "spouse" || spouses.DegreesOfSep != 1 {
		t.Errorf("spouse kinship = %+v", spouses)
	}

	sibs, err := FindKinship(ctx, db, "child", "sib")
	if err != nil {
		t.Fatal(err)
	}
	if sibs.PathKey != "parent.child" || sibs.DegreesOfSep != 2 {
		t.Errorf("sibling kinship = %+v", sibs)
	}

	grand, err := FindKinship(ctx, db, "child", "gp")
	if err != nil {
		t.Fatal(err)
	}
	if grand.PathKey != "parent.parent" || grand.DegreesOfSep != 2 {
		t.Errorf("grandparent kinship = %+v", grand)
	}

	if _, err := FindKinship(ctx, db, "child", "stranger"); err == nil {
		t.Error("expected error for unconnected individuals")
	}
}

func TestValidateParentLink(t *testing.T) {
	ctx := context.Background()
	db := fixtureDB(t)
	seedFamily(t, db)

	if err := ValidateParentLink(ctx, db, "child", "child"); err == nil {
		t.Error("expected self-parent rejection")
	}
	if err := ValidateParentLink(ctx, db, "father", "child"); err == nil {
		t.Error("expected duplicate edge rejection")
	}
	if err := ValidateParentLink(ctx, db, "child", "gp"); err == nil {
		t.Error("expected cycle rejection for child -> gp")
	}
	if err := ValidateParentLink(ctx, db, "ghost", "child"); err == nil {
		t.Error("expected missing parent rejection")
	}
	if err := ValidateParentLink(ctx, db, "stranger", "child"); err != nil {
		t.Errorf("expected unrelated link to pass: %v", err)
	}
}
