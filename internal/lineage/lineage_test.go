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

func addUnion(t *testing.T, db *sql.DB, id, partnerA, partnerB, status string) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO unions (id, partner_a_id, partner_b_id, union_type, status)
		VALUES (?, ?, ?, 'CIVIL', ?)`, id, partnerA, partnerB, status); err != nil {
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

func TestKinshipSiblingPrecision(t *testing.T) {
	ctx := context.Background()

	addStepFamily := func(t *testing.T, db *sql.DB, status string) {
		t.Helper()
		addPerson(t, db, "step-parent-a", "SPAN", "Step Parent A", "MALE", "")
		addPerson(t, db, "step-parent-b", "SPBN", "Step Parent B", "FEMALE", "")
		addPerson(t, db, "step-a", "SAN", "Step A", "MALE", "")
		addPerson(t, db, "step-b", "SBN", "Step B", "FEMALE", "")
		addEdge(t, db, "step-parent-a", "step-a", "BIOLOGICAL", 1)
		addEdge(t, db, "step-parent-b", "step-b", "BIOLOGICAL", 1)
		if _, err := db.Exec(`INSERT INTO unions (id, partner_a_id, partner_b_id, union_type, status)
			VALUES ('step-union', 'step-parent-a', 'step-parent-b', 'CIVIL', ?)`, status); err != nil {
			t.Fatal(err)
		}
	}

	cases := []struct {
		name           string
		setup          func(t *testing.T, db *sql.DB)
		start          string
		target         string
		wantModifiers  []any
		wantConfidence string
		wantStatus     string
	}{
		{
			name: "half sibling with distinct other parents",
			setup: func(t *testing.T, db *sql.DB) {
				addPerson(t, db, "mother2", "M2n", "Mother 2", "FEMALE", "")
				addEdge(t, db, "mother2", "sib", "BIOLOGICAL", 0)
			},
			start:          "child",
			target:         "sib",
			wantModifiers:  []any{"half"},
			wantConfidence: "exact",
		},
		{
			name:           "incomplete sibling parent records",
			setup:          func(t *testing.T, db *sql.DB) {},
			start:          "child",
			target:         "sib",
			wantConfidence: "incomplete_parent_records",
		},
		{
			name: "adoptive sibling",
			setup: func(t *testing.T, db *sql.DB) {
				addPerson(t, db, "adoptive-parent", "APn", "Adoptive Parent", "FEMALE", "")
				addPerson(t, db, "adoptee-a", "AAn", "Adoptee A", "MALE", "")
				addPerson(t, db, "adoptee-b", "ABn", "Adoptee B", "FEMALE", "")
				addEdge(t, db, "adoptive-parent", "adoptee-a", "ADOPTIVE", 1)
				addEdge(t, db, "adoptive-parent", "adoptee-b", "ADOPTIVE", 1)
			},
			start:          "adoptee-a",
			target:         "adoptee-b",
			wantModifiers:  []any{"adoptive"},
			wantConfidence: "exact",
		},
		{
			name: "foster sibling",
			setup: func(t *testing.T, db *sql.DB) {
				addPerson(t, db, "foster-parent", "FPn", "Foster Parent", "MALE", "")
				addPerson(t, db, "foster-a", "FAn", "Foster A", "MALE", "")
				addPerson(t, db, "foster-b", "FBn", "Foster B", "FEMALE", "")
				addEdge(t, db, "foster-parent", "foster-a", "FOSTER", 1)
				addEdge(t, db, "foster-parent", "foster-b", "FOSTER", 1)
			},
			start:          "foster-a",
			target:         "foster-b",
			wantModifiers:  []any{"foster"},
			wantConfidence: "exact",
		},
		{
			name:           "active step sibling",
			setup:          func(t *testing.T, db *sql.DB) { addStepFamily(t, db, "ACTIVE") },
			start:          "step-a",
			target:         "step-b",
			wantModifiers:  []any{"step"},
			wantConfidence: "exact",
			wantStatus:     "ACTIVE",
		},
		{
			name:           "former step sibling after dissolved union",
			setup:          func(t *testing.T, db *sql.DB) { addStepFamily(t, db, "DISSOLVED") },
			start:          "step-a",
			target:         "step-b",
			wantModifiers:  []any{"former", "step"},
			wantConfidence: "exact",
			wantStatus:     "DISSOLVED",
		},
		{
			name:           "step sibling from widowed union",
			setup:          func(t *testing.T, db *sql.DB) { addStepFamily(t, db, "WIDOWED") },
			start:          "step-a",
			target:         "step-b",
			wantModifiers:  []any{"step"},
			wantConfidence: "exact",
			wantStatus:     "WIDOWED",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db := fixtureDB(t)
			seedFamily(t, db)
			tc.setup(t, db)

			result, err := FindKinship(ctx, db, tc.start, tc.target)
			if err != nil {
				t.Fatal(err)
			}
			if result.Term.Key != "sibling" || result.Term.Confidence != tc.wantConfidence {
				t.Fatalf("term = %+v", result.Term)
			}
			if len(result.Term.Modifiers) != len(tc.wantModifiers) {
				t.Fatalf("modifiers = %#v, want %#v", result.Term.Modifiers, tc.wantModifiers)
			}
			for index, modifier := range tc.wantModifiers {
				if result.Term.Modifiers[index] != modifier {
					t.Fatalf("modifiers = %#v, want %#v", result.Term.Modifiers, tc.wantModifiers)
				}
			}
			var decoded map[string]any
			if err := json.Unmarshal(mustJSON(t, result), &decoded); err != nil {
				t.Fatal(err)
			}
			term := decoded["term"].(map[string]any)
			parameters := term["parameters"].(map[string]any)
			if tc.wantStatus == "" {
				if _, exists := parameters["union_status"]; exists {
					t.Fatalf("union status = %#v, want omitted", parameters["union_status"])
				}
			} else if parameters["union_status"] != tc.wantStatus {
				t.Fatalf("union status = %#v, want %q", parameters["union_status"], tc.wantStatus)
			}
		})
	}
}

func TestKinshipCollateralTerms(t *testing.T) {
	ctx := context.Background()

	fullAuntSetup := func(t *testing.T, db *sql.DB) {
		t.Helper()
		addPerson(t, db, "grandmother", "GMn", "Grandmother", "FEMALE", "")
		addPerson(t, db, "aunt", "AUn", "Aunt", "FEMALE", "")
		addEdge(t, db, "grandmother", "father", "BIOLOGICAL", 0)
		addEdge(t, db, "gp", "aunt", "BIOLOGICAL", 0)
		addEdge(t, db, "grandmother", "aunt", "BIOLOGICAL", 0)
	}

	cases := []struct {
		name           string
		setup          func(t *testing.T, db *sql.DB)
		start          string
		target         string
		wantKey        string
		wantModifiers  []any
		wantConfidence string
		wantParameters map[string]any
	}{
		{
			name:           "aunt",
			setup:          fullAuntSetup,
			start:          "child",
			target:         "aunt",
			wantKey:        "aunt_uncle",
			wantConfidence: "exact",
		},
		{
			name: "half aunt",
			setup: func(t *testing.T, db *sql.DB) {
				addPerson(t, db, "aunt", "AUn", "Aunt", "FEMALE", "")
				addPerson(t, db, "father-other", "FOn", "Father Other", "FEMALE", "")
				addPerson(t, db, "aunt-other", "AOn", "Aunt Other", "MALE", "")
				addEdge(t, db, "gp", "aunt", "BIOLOGICAL", 0)
				addEdge(t, db, "father-other", "father", "BIOLOGICAL", 0)
				addEdge(t, db, "aunt-other", "aunt", "BIOLOGICAL", 0)
			},
			start:          "child",
			target:         "aunt",
			wantKey:        "aunt_uncle",
			wantModifiers:  []any{"half"},
			wantConfidence: "exact",
		},
		{
			name: "great aunt",
			setup: func(t *testing.T, db *sql.DB) {
				addPerson(t, db, "great-grandparent", "GGPn", "Great Grandparent", "MALE", "")
				addPerson(t, db, "great-grandmother", "GGMn", "Great Grandmother", "FEMALE", "")
				addPerson(t, db, "great-aunt", "GAn", "Great Aunt", "FEMALE", "")
				addEdge(t, db, "great-grandparent", "gp", "BIOLOGICAL", 0)
				addEdge(t, db, "great-grandparent", "great-aunt", "BIOLOGICAL", 0)
				addEdge(t, db, "great-grandmother", "gp", "BIOLOGICAL", 0)
				addEdge(t, db, "great-grandmother", "great-aunt", "BIOLOGICAL", 0)
			},
			start:          "child",
			target:         "great-aunt",
			wantKey:        "aunt_uncle",
			wantModifiers:  []any{"great"},
			wantConfidence: "exact",
			wantParameters: map[string]any{"great_count": float64(1)},
		},
		{
			name: "aunt by marriage",
			setup: func(t *testing.T, db *sql.DB) {
				fullAuntSetup(t, db)
				addPerson(t, db, "aunt-spouse", "ASn", "Aunt Spouse", "MALE", "")
				addUnion(t, db, "aunt-union", "aunt", "aunt-spouse", "ACTIVE")
			},
			start:          "child",
			target:         "aunt-spouse",
			wantKey:        "aunt_uncle",
			wantModifiers:  []any{"by_marriage"},
			wantConfidence: "exact",
		},
		{
			name: "step aunt through parent spouse",
			setup: func(t *testing.T, db *sql.DB) {
				addPerson(t, db, "step-parent", "SPn", "Step Parent", "MALE", "")
				addPerson(t, db, "step-grandparent", "SGPn", "Step Grandparent", "FEMALE", "")
				addPerson(t, db, "step-aunt", "SAun", "Step Aunt", "FEMALE", "")
				addUnion(t, db, "step-parent-union", "mother", "step-parent", "ACTIVE")
				addEdge(t, db, "step-grandparent", "step-parent", "BIOLOGICAL", 1)
				addEdge(t, db, "step-grandparent", "step-aunt", "BIOLOGICAL", 0)
			},
			start:          "child",
			target:         "step-aunt",
			wantKey:        "aunt_uncle",
			wantModifiers:  []any{"step"},
			wantConfidence: "exact",
			wantParameters: map[string]any{"union_status": "ACTIVE"},
		},
		{
			name: "niece",
			setup: func(t *testing.T, db *sql.DB) {
				addPerson(t, db, "niece", "Nn", "Niece", "FEMALE", "")
				addEdge(t, db, "mother", "sib", "BIOLOGICAL", 0)
				addEdge(t, db, "sib", "niece", "BIOLOGICAL", 1)
			},
			start:          "child",
			target:         "niece",
			wantKey:        "niece_nephew",
			wantConfidence: "exact",
		},
		{
			name: "first cousin",
			setup: func(t *testing.T, db *sql.DB) {
				fullAuntSetup(t, db)
				addPerson(t, db, "cousin", "Cn2", "Cousin", "MALE", "")
				addEdge(t, db, "aunt", "cousin", "BIOLOGICAL", 1)
			},
			start:          "child",
			target:         "cousin",
			wantKey:        "cousin",
			wantModifiers:  []any{"full"},
			wantConfidence: "exact",
			wantParameters: map[string]any{"degree": float64(1), "removed": float64(0)},
		},
		{
			name: "second cousin",
			setup: func(t *testing.T, db *sql.DB) {
				addPerson(t, db, "great-grandparent", "GGPn", "Great Grandparent", "MALE", "")
				addPerson(t, db, "great-grandmother", "GGMn", "Great Grandmother", "FEMALE", "")
				addPerson(t, db, "granduncle", "GUn", "Granduncle", "MALE", "")
				addPerson(t, db, "cousin-parent", "CPn", "Cousin Parent", "FEMALE", "")
				addPerson(t, db, "second-cousin", "SCn", "Second Cousin", "MALE", "")
				addEdge(t, db, "great-grandparent", "gp", "BIOLOGICAL", 0)
				addEdge(t, db, "great-grandparent", "granduncle", "BIOLOGICAL", 0)
				addEdge(t, db, "great-grandmother", "gp", "BIOLOGICAL", 0)
				addEdge(t, db, "great-grandmother", "granduncle", "BIOLOGICAL", 0)
				addEdge(t, db, "granduncle", "cousin-parent", "BIOLOGICAL", 1)
				addEdge(t, db, "cousin-parent", "second-cousin", "BIOLOGICAL", 1)
			},
			start:          "child",
			target:         "second-cousin",
			wantKey:        "cousin",
			wantModifiers:  []any{"full"},
			wantConfidence: "exact",
			wantParameters: map[string]any{"degree": float64(2), "removed": float64(0)},
		},
		{
			name: "first cousin once removed",
			setup: func(t *testing.T, db *sql.DB) {
				fullAuntSetup(t, db)
				addPerson(t, db, "cousin", "Cn2", "Cousin", "MALE", "")
				addPerson(t, db, "cousin-child", "CCn", "Cousin Child", "FEMALE", "")
				addEdge(t, db, "aunt", "cousin", "BIOLOGICAL", 1)
				addEdge(t, db, "cousin", "cousin-child", "BIOLOGICAL", 1)
			},
			start:          "child",
			target:         "cousin-child",
			wantKey:        "cousin",
			wantModifiers:  []any{"full"},
			wantConfidence: "exact",
			wantParameters: map[string]any{"degree": float64(1), "removed": float64(1)},
		},
		{
			name: "half cousin",
			setup: func(t *testing.T, db *sql.DB) {
				addPerson(t, db, "shared-grandparent", "SHGPn", "Shared Grandparent", "MALE", "")
				addPerson(t, db, "cousin-parent-a", "CPAn", "Cousin Parent A", "MALE", "")
				addPerson(t, db, "cousin-parent-b", "CPBn", "Cousin Parent B", "FEMALE", "")
				addPerson(t, db, "parent-a-other", "PAOn", "Parent A Other", "FEMALE", "")
				addPerson(t, db, "parent-b-other", "PBOn", "Parent B Other", "MALE", "")
				addPerson(t, db, "cousin-a", "CAn", "Cousin A", "MALE", "")
				addPerson(t, db, "cousin-b", "CBn", "Cousin B", "FEMALE", "")
				addEdge(t, db, "shared-grandparent", "cousin-parent-a", "BIOLOGICAL", 1)
				addEdge(t, db, "shared-grandparent", "cousin-parent-b", "BIOLOGICAL", 1)
				addEdge(t, db, "parent-a-other", "cousin-parent-a", "BIOLOGICAL", 0)
				addEdge(t, db, "parent-b-other", "cousin-parent-b", "BIOLOGICAL", 0)
				addEdge(t, db, "cousin-parent-a", "cousin-a", "BIOLOGICAL", 1)
				addEdge(t, db, "cousin-parent-b", "cousin-b", "BIOLOGICAL", 1)
			},
			start:          "cousin-a",
			target:         "cousin-b",
			wantKey:        "cousin",
			wantModifiers:  []any{"half"},
			wantConfidence: "exact",
			wantParameters: map[string]any{"degree": float64(1), "removed": float64(0)},
		},
		{
			name: "cousin with incomplete ancestor records",
			setup: func(t *testing.T, db *sql.DB) {
				addPerson(t, db, "shared-grandparent", "SHGPn", "Shared Grandparent", "MALE", "")
				addPerson(t, db, "cousin-parent-a", "CPAn", "Cousin Parent A", "MALE", "")
				addPerson(t, db, "cousin-parent-b", "CPBn", "Cousin Parent B", "FEMALE", "")
				addPerson(t, db, "cousin-a", "CAn", "Cousin A", "MALE", "")
				addPerson(t, db, "cousin-b", "CBn", "Cousin B", "FEMALE", "")
				addEdge(t, db, "shared-grandparent", "cousin-parent-a", "BIOLOGICAL", 1)
				addEdge(t, db, "shared-grandparent", "cousin-parent-b", "BIOLOGICAL", 1)
				addEdge(t, db, "cousin-parent-a", "cousin-a", "BIOLOGICAL", 1)
				addEdge(t, db, "cousin-parent-b", "cousin-b", "BIOLOGICAL", 1)
			},
			start:          "cousin-a",
			target:         "cousin-b",
			wantKey:        "cousin",
			wantConfidence: "incomplete_parent_records",
			wantParameters: map[string]any{"degree": float64(1), "removed": float64(0)},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db := fixtureDB(t)
			seedFamily(t, db)
			tc.setup(t, db)

			result, err := FindKinship(ctx, db, tc.start, tc.target)
			if err != nil {
				t.Fatal(err)
			}
			if result.Term.Key != tc.wantKey || result.Term.Confidence != tc.wantConfidence {
				t.Fatalf("term = %+v", result.Term)
			}
			if len(result.Term.Modifiers) != len(tc.wantModifiers) {
				t.Fatalf("modifiers = %#v, want %#v", result.Term.Modifiers, tc.wantModifiers)
			}
			for index, modifier := range tc.wantModifiers {
				if result.Term.Modifiers[index] != modifier {
					t.Fatalf("modifiers = %#v, want %#v", result.Term.Modifiers, tc.wantModifiers)
				}
			}

			var decoded map[string]any
			if err := json.Unmarshal(mustJSON(t, result), &decoded); err != nil {
				t.Fatal(err)
			}
			parameters := decoded["term"].(map[string]any)["parameters"].(map[string]any)
			for key, want := range tc.wantParameters {
				if parameters[key] != want {
					t.Fatalf("parameter %s = %#v, want %#v", key, parameters[key], want)
				}
			}
		})
	}
}

func TestKinshipAffinalAndCompoundTerms(t *testing.T) {
	ctx := context.Background()

	cases := []struct {
		name           string
		setup          func(t *testing.T, db *sql.DB)
		start          string
		target         string
		wantKey        string
		wantConfidence string
		wantStatus     string
	}{
		{
			name: "parent in law",
			setup: func(t *testing.T, db *sql.DB) {
				addPerson(t, db, "spouse", "SPn", "Spouse", "FEMALE", "")
				addPerson(t, db, "spouse-parent", "SPPn", "Spouse Parent", "MALE", "")
				addUnion(t, db, "marriage", "child", "spouse", "ACTIVE")
				addEdge(t, db, "spouse-parent", "spouse", "BIOLOGICAL", 1)
			},
			start:          "child",
			target:         "spouse-parent",
			wantKey:        "parent_in_law",
			wantConfidence: "exact",
			wantStatus:     "ACTIVE",
		},
		{
			name: "child in law",
			setup: func(t *testing.T, db *sql.DB) {
				addPerson(t, db, "child-spouse", "CSPn", "Child Spouse", "FEMALE", "")
				addUnion(t, db, "child-marriage", "sib", "child-spouse", "ACTIVE")
			},
			start:          "father",
			target:         "child-spouse",
			wantKey:        "child_in_law",
			wantConfidence: "exact",
			wantStatus:     "ACTIVE",
		},
		{
			name: "sibling in law through sibling spouse",
			setup: func(t *testing.T, db *sql.DB) {
				addPerson(t, db, "sib-spouse", "SSPn", "Sibling Spouse", "MALE", "")
				addUnion(t, db, "sibling-marriage", "sib", "sib-spouse", "ACTIVE")
			},
			start:          "child",
			target:         "sib-spouse",
			wantKey:        "sibling_in_law",
			wantConfidence: "exact",
			wantStatus:     "ACTIVE",
		},
		{
			name: "sibling in law through spouse sibling",
			setup: func(t *testing.T, db *sql.DB) {
				addPerson(t, db, "spouse", "SPn", "Spouse", "FEMALE", "")
				addPerson(t, db, "spouse-parent", "SPPn", "Spouse Parent", "MALE", "")
				addPerson(t, db, "spouse-sibling", "SPSn", "Spouse Sibling", "MALE", "")
				addUnion(t, db, "marriage", "child", "spouse", "ACTIVE")
				addEdge(t, db, "spouse-parent", "spouse", "BIOLOGICAL", 1)
				addEdge(t, db, "spouse-parent", "spouse-sibling", "BIOLOGICAL", 0)
			},
			start:          "child",
			target:         "spouse-sibling",
			wantKey:        "sibling_in_law",
			wantConfidence: "exact",
			wantStatus:     "ACTIVE",
		},
		{
			name: "cousin in law",
			setup: func(t *testing.T, db *sql.DB) {
				addPerson(t, db, "grandmother", "GMn", "Grandmother", "FEMALE", "")
				addPerson(t, db, "aunt", "AUn", "Aunt", "FEMALE", "")
				addEdge(t, db, "grandmother", "father", "BIOLOGICAL", 0)
				addEdge(t, db, "gp", "aunt", "BIOLOGICAL", 0)
				addEdge(t, db, "grandmother", "aunt", "BIOLOGICAL", 0)
				addPerson(t, db, "cousin", "Cn2", "Cousin", "MALE", "")
				addPerson(t, db, "cousin-spouse", "CSPn", "Cousin Spouse", "FEMALE", "")
				addEdge(t, db, "aunt", "cousin", "BIOLOGICAL", 1)
				addUnion(t, db, "cousin-marriage", "cousin", "cousin-spouse", "ACTIVE")
			},
			start:          "child",
			target:         "cousin-spouse",
			wantKey:        "cousin_in_law",
			wantConfidence: "exact",
			wantStatus:     "ACTIVE",
		},
		{
			name: "sibling of uncle spouse",
			setup: func(t *testing.T, db *sql.DB) {
				addPerson(t, db, "grandmother", "GMn", "Grandmother", "FEMALE", "")
				addPerson(t, db, "aunt", "AUn", "Aunt", "FEMALE", "")
				addEdge(t, db, "grandmother", "father", "BIOLOGICAL", 0)
				addEdge(t, db, "gp", "aunt", "BIOLOGICAL", 0)
				addEdge(t, db, "grandmother", "aunt", "BIOLOGICAL", 0)
				addPerson(t, db, "aunt-spouse", "ASn", "Aunt Spouse", "FEMALE", "")
				addPerson(t, db, "spouse-parent", "SPPn", "Spouse Parent", "MALE", "")
				addPerson(t, db, "spouse-sibling", "SPSn", "Spouse Sibling", "FEMALE", "")
				addUnion(t, db, "aunt-union", "aunt", "aunt-spouse", "ACTIVE")
				addEdge(t, db, "spouse-parent", "aunt-spouse", "BIOLOGICAL", 1)
				addEdge(t, db, "spouse-parent", "spouse-sibling", "BIOLOGICAL", 0)
			},
			start:          "child",
			target:         "spouse-sibling",
			wantKey:        "composed",
			wantConfidence: "exact",
			wantStatus:     "ACTIVE",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db := fixtureDB(t)
			seedFamily(t, db)
			tc.setup(t, db)

			result, err := FindKinship(ctx, db, tc.start, tc.target)
			if err != nil {
				t.Fatal(err)
			}
			if result.Term.Key != tc.wantKey || result.Term.Confidence != tc.wantConfidence {
				t.Fatalf("term = %+v", result.Term)
			}
			if result.Term.Parameters.UnionStatus != tc.wantStatus {
				t.Fatalf("union status = %q, want %q", result.Term.Parameters.UnionStatus, tc.wantStatus)
			}
		})
	}
}

func TestKinshipCompoundComposition(t *testing.T) {
	ctx := context.Background()
	db := fixtureDB(t)
	seedFamily(t, db)
	addPerson(t, db, "grandmother", "GMn", "Grandmother", "FEMALE", "")
	addPerson(t, db, "aunt", "AUn", "Aunt", "FEMALE", "")
	addEdge(t, db, "grandmother", "father", "BIOLOGICAL", 0)
	addEdge(t, db, "gp", "aunt", "BIOLOGICAL", 0)
	addEdge(t, db, "grandmother", "aunt", "BIOLOGICAL", 0)
	addPerson(t, db, "aunt-spouse", "ASn", "Aunt Spouse", "FEMALE", "")
	addPerson(t, db, "spouse-parent", "SPPn", "Spouse Parent", "MALE", "")
	addPerson(t, db, "spouse-sibling", "SPSn", "Spouse Sibling", "FEMALE", "")
	addUnion(t, db, "aunt-union", "aunt", "aunt-spouse", "ACTIVE")
	addEdge(t, db, "spouse-parent", "aunt-spouse", "BIOLOGICAL", 1)
	addEdge(t, db, "spouse-parent", "spouse-sibling", "BIOLOGICAL", 0)

	result, err := FindKinship(ctx, db, "child", "spouse-sibling")
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(mustJSON(t, result), &decoded); err != nil {
		t.Fatal(err)
	}
	composition, ok := decoded["term"].(map[string]any)["composition"].([]any)
	if !ok || len(composition) != 3 {
		t.Fatalf("composition = %#v", decoded["term"].(map[string]any)["composition"])
	}
	anchor, ok := composition[0].(map[string]any)
	if !ok || anchor["role"] != "anchor" || anchor["key"] != "aunt_uncle" ||
		anchor["gender"] != "FEMALE" || anchor["modifiers"] != nil {
		t.Errorf("anchor = %#v", composition[0])
	}
	spouse, ok := composition[1].(map[string]any)
	if !ok || spouse["role"] != "spouse" || spouse["key"] != "spouse" ||
		spouse["gender"] != "FEMALE" || spouse["union_status"] != "ACTIVE" {
		t.Errorf("spouse = %#v", composition[1])
	}
	relative, ok := composition[2].(map[string]any)
	if !ok || relative["role"] != "relative" || relative["key"] != "sibling" ||
		relative["gender"] != "FEMALE" || relative["modifiers"] != nil {
		t.Errorf("relative = %#v", composition[2])
	}
}

func TestKinshipSecondaryBloodTerm(t *testing.T) {
	ctx := context.Background()
	db := fixtureDB(t)
	seedFamily(t, db)
	addPerson(t, db, "grandmother", "GMn", "Grandmother", "FEMALE", "")
	addPerson(t, db, "aunt", "AUn", "Aunt", "FEMALE", "")
	addPerson(t, db, "cousin", "Cn2", "Cousin", "FEMALE", "")
	addEdge(t, db, "grandmother", "father", "BIOLOGICAL", 0)
	addEdge(t, db, "gp", "aunt", "BIOLOGICAL", 0)
	addEdge(t, db, "grandmother", "aunt", "BIOLOGICAL", 0)
	addEdge(t, db, "aunt", "cousin", "BIOLOGICAL", 1)
	addUnion(t, db, "cousin-marriage", "child", "cousin", "ACTIVE")

	result, err := FindKinship(ctx, db, "child", "cousin")
	if err != nil {
		t.Fatal(err)
	}
	if result.Term.Key != "spouse" {
		t.Fatalf("primary term = %+v", result.Term)
	}
	if len(result.SecondaryTerms) != 1 || result.SecondaryTerms[0].Key != "cousin" {
		t.Fatalf("secondary terms = %#v", result.SecondaryTerms)
	}
	if degree := result.SecondaryTerms[0].Parameters.Degree; degree == nil || *degree != 1 {
		t.Fatalf("secondary degree = %#v", result.SecondaryTerms[0].Parameters.Degree)
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
