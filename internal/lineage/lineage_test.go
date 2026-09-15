package lineage

import (
	"context"
	"database/sql"
	"encoding/json"
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

func TestKinshipContractIncludesEdgeMetadataAndPeople(t *testing.T) {
	ctx := context.Background()
	db := fixtureDB(t)
	seedFamily(t, db)

	siblings, err := FindKinship(ctx, db, "child", "sib")
	if err != nil {
		t.Fatal(err)
	}
	var siblingResult map[string]any
	if err := json.Unmarshal(mustJSON(t, siblings), &siblingResult); err != nil {
		t.Fatal(err)
	}
	segments, ok := siblingResult["segments"].([]any)
	if !ok || len(segments) != 2 {
		t.Fatalf("sibling segments = %#v", siblingResult["segments"])
	}
	first, ok := segments[0].(map[string]any)
	if !ok {
		t.Fatalf("first segment = %#v", segments[0])
	}
	if first["relationship_type"] != "BIOLOGICAL" || first["is_name_source"] != true {
		t.Errorf("first parent segment = %#v", first)
	}
	second, ok := segments[1].(map[string]any)
	if !ok {
		t.Fatalf("second segment = %#v", segments[1])
	}
	if second["relationship_type"] != "BIOLOGICAL" || second["is_name_source"] != true {
		t.Errorf("second child segment = %#v", second)
	}
	people, ok := siblingResult["individuals"].(map[string]any)
	if !ok || len(people) != 3 {
		t.Fatalf("sibling individuals = %#v", siblingResult["individuals"])
	}
	child, ok := people["child"].(map[string]any)
	if !ok {
		t.Fatalf("child individual = %#v", people["child"])
	}
	if child["full_latin"] != "C F GP" || child["gender"] != "MALE" {
		t.Errorf("child individual = %#v", child)
	}

	spouses, err := FindKinship(ctx, db, "father", "mother")
	if err != nil {
		t.Fatal(err)
	}
	var spouseResult map[string]any
	if err := json.Unmarshal(mustJSON(t, spouses), &spouseResult); err != nil {
		t.Fatal(err)
	}
	spouseSegments, ok := spouseResult["segments"].([]any)
	if !ok || len(spouseSegments) != 1 {
		t.Fatalf("spouse segments = %#v", spouseResult["segments"])
	}
	spouse, ok := spouseSegments[0].(map[string]any)
	if !ok {
		t.Fatalf("spouse segment = %#v", spouseSegments[0])
	}
	if spouse["union_type"] != "TRADITIONAL" || spouse["union_status"] != "ACTIVE" {
		t.Errorf("spouse segment = %#v", spouse)
	}
	spousePeople, ok := spouseResult["individuals"].(map[string]any)
	if !ok || len(spousePeople) != 2 {
		t.Fatalf("spouse individuals = %#v", spouseResult["individuals"])
	}
}

func TestKinshipCoreTermDescriptors(t *testing.T) {
	ctx := context.Background()
	db := fixtureDB(t)
	seedFamily(t, db)
	addEdge(t, db, "mother", "sib", "BIOLOGICAL", 0)
	addPerson(t, db, "great", "GREATn", "GREAT", "MALE", "")
	addEdge(t, db, "great", "gp", "BIOLOGICAL", 1)

	cases := []struct {
		name     string
		start    string
		target   string
		wantKey  string
		wantMods []any
		check    func(t *testing.T, term map[string]any)
	}{
		{
			name: "self", start: "child", target: "child", wantKey: "self",
		},
		{
			name: "parent", start: "child", target: "father", wantKey: "parent",
			check: func(t *testing.T, term map[string]any) {
				if term["gender"] != "MALE" {
					t.Errorf("parent gender = %#v", term["gender"])
				}
			},
		},
		{
			name: "child", start: "father", target: "child", wantKey: "child",
			check: func(t *testing.T, term map[string]any) {
				if term["gender"] != "MALE" {
					t.Errorf("child gender = %#v", term["gender"])
				}
			},
		},
		{
			name: "grandparent through ancestor depth", start: "child", target: "gp", wantKey: "ancestor",
			check: func(t *testing.T, term map[string]any) {
				parameters := term["parameters"].(map[string]any)
				if parameters["generations_up"] != float64(2) {
					t.Errorf("ancestor parameters = %#v", parameters)
				}
			},
		},
		{
			name: "arbitrary ancestor depth", start: "child", target: "great", wantKey: "ancestor",
			check: func(t *testing.T, term map[string]any) {
				parameters := term["parameters"].(map[string]any)
				if parameters["generations_up"] != float64(3) {
					t.Errorf("ancestor parameters = %#v", parameters)
				}
			},
		},
		{
			name: "grandchild through descendant depth", start: "gp", target: "child", wantKey: "descendant",
			check: func(t *testing.T, term map[string]any) {
				parameters := term["parameters"].(map[string]any)
				if parameters["generations_down"] != float64(2) {
					t.Errorf("descendant parameters = %#v", parameters)
				}
			},
		},
		{
			name: "arbitrary descendant depth", start: "great", target: "child", wantKey: "descendant",
			check: func(t *testing.T, term map[string]any) {
				parameters := term["parameters"].(map[string]any)
				if parameters["generations_down"] != float64(3) {
					t.Errorf("descendant parameters = %#v", parameters)
				}
			},
		},
		{
			name: "full sibling", start: "child", target: "sib", wantKey: "sibling", wantMods: []any{"full"},
			check: func(t *testing.T, term map[string]any) {
				parameters := term["parameters"].(map[string]any)
				if parameters["shared_parents"] != float64(2) {
					t.Errorf("sibling parameters = %#v", parameters)
				}
			},
		},
		{
			name: "spouse", start: "father", target: "mother", wantKey: "spouse",
			check: func(t *testing.T, term map[string]any) {
				if term["gender"] != "FEMALE" {
					t.Errorf("spouse gender = %#v", term["gender"])
				}
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			result, err := FindKinship(ctx, db, tc.start, tc.target)
			if err != nil {
				t.Fatal(err)
			}
			var decoded map[string]any
			if err := json.Unmarshal(mustJSON(t, result), &decoded); err != nil {
				t.Fatal(err)
			}
			term, ok := decoded["term"].(map[string]any)
			if !ok {
				t.Fatalf("term = %#v", decoded["term"])
			}
			if term["perspective"] != "a_to_b" || term["key"] != tc.wantKey || term["confidence"] != "exact" {
				t.Errorf("term = %#v", term)
			}
			if tc.wantMods != nil {
				if modifiers, ok := term["modifiers"].([]any); !ok || len(modifiers) != len(tc.wantMods) {
					t.Errorf("modifiers = %#v, want %#v", term["modifiers"], tc.wantMods)
				} else {
					for index, modifier := range tc.wantMods {
						if modifiers[index] != modifier {
							t.Errorf("modifiers = %#v, want %#v", modifiers, tc.wantMods)
						}
					}
				}
			}
			if tc.check != nil {
				tc.check(t, term)
			}
		})
	}
}

func mustJSON(t *testing.T, value any) []byte {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return data
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
