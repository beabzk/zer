package api

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func seedSmallFamily(t *testing.T, r chi.Router, treeID string) map[string]string {
	t.Helper()
	ids := map[string]string{}
	for _, p := range []struct {
		key, native, latin, gender string
	}{
		{"gp", "GPn", "GP", "MALE"},
		{"father", "Fn", "F", "MALE"},
		{"mother", "Mn", "M", "FEMALE"},
		{"child", "Cn", "C", "MALE"},
		{"sib", "Sn", "S", "FEMALE"},
	} {
		ids[p.key] = createPerson(t, r, treeID, map[string]any{
			"given_name_native": p.native, "given_name_latin": p.latin, "gender": p.gender})
	}
	edgePath := "/api/v1/trees/" + treeID + "/relationships/parent-child"
	for _, e := range []map[string]any{
		{"parent_id": ids["gp"], "child_id": ids["father"], "is_name_source": true},
		{"parent_id": ids["father"], "child_id": ids["child"], "is_name_source": true},
		{"parent_id": ids["mother"], "child_id": ids["child"]},
		{"parent_id": ids["father"], "child_id": ids["sib"], "is_name_source": true},
	} {
		rec := doRequest(t, r, http.MethodPost, edgePath, e)
		if rec.Code != http.StatusCreated {
			t.Fatalf("seed edge %+v: status = %d", e, rec.Code)
		}
	}
	rec := doRequest(t, r, http.MethodPost, "/api/v1/trees/"+treeID+"/relationships/union",
		map[string]any{"partner_a_id": ids["father"], "partner_b_id": ids["mother"]})
	if rec.Code != http.StatusCreated {
		t.Fatalf("seed union: status = %d", rec.Code)
	}
	return ids
}

func TestKinshipEndpoint(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "Kin")
	ids := seedSmallFamily(t, r, treeID)

	rec := doRequest(t, r, http.MethodGet,
		"/api/v1/trees/"+treeID+"/analysis/kinship?person_a="+ids["child"]+"&person_b="+ids["sib"], nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("kinship: status = %d", rec.Code)
	}
	var result map[string]any
	decodeBody(t, rec, &result)
	if result["path_key"] != "parent.child" || result["degrees_of_sep"] != float64(2) {
		t.Errorf("unexpected kinship: %+v", result)
	}
	segments, ok := result["segments"].([]any)
	if !ok || len(segments) != 2 {
		t.Fatalf("kinship segments = %#v", result["segments"])
	}
	first, ok := segments[0].(map[string]any)
	if !ok {
		t.Fatalf("first kinship segment = %#v", segments[0])
	}
	if first["relationship_type"] != "BIOLOGICAL" || first["is_name_source"] != true {
		t.Errorf("first kinship segment = %#v", first)
	}
	people, ok := result["individuals"].(map[string]any)
	if !ok || len(people) != 3 {
		t.Fatalf("kinship individuals = %#v", result["individuals"])
	}
	term, ok := result["term"].(map[string]any)
	if !ok || term["key"] != "sibling" || term["perspective"] != "a_to_b" {
		t.Fatalf("kinship term = %#v", result["term"])
	}

	rec = doRequest(t, r, http.MethodGet,
		"/api/v1/trees/"+treeID+"/analysis/kinship?person_a="+ids["child"], nil)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("missing param: status = %d, want 400", rec.Code)
	}
}

type lineageNodePayload struct {
	ID          string   `json:"id"`
	Depth       int      `json:"depth"`
	Path        []string `json:"path"`
	FullNative  string   `json:"full_native"`
	FullLatin   string   `json:"full_latin"`
	Gender      string   `json:"gender"`
	BirthYearEC *int     `json:"birth_year_ec"`
	DeathYearEC *int     `json:"death_year_ec"`
	IsDeceased  bool     `json:"is_deceased"`
}

func TestLineageEndpoint(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "Lin")
	ids := seedSmallFamily(t, r, treeID)

	rec := doRequest(t, r, http.MethodGet,
		"/api/v1/trees/"+treeID+"/analysis/lineage/"+ids["child"]+"?direction=ancestors&depth=10", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("lineage: status = %d", rec.Code)
	}
	var result struct {
		Truncated bool                 `json:"truncated"`
		Nodes     []lineageNodePayload `json:"nodes"`
		Unions    []struct {
			ID     string `json:"id"`
			Source string `json:"source"`
			Target string `json:"target"`
		} `json:"unions"`
	}
	decodeBody(t, rec, &result)
	if len(result.Nodes) != 4 {
		t.Fatalf("ancestor nodes = %d, want 4 (child, father, mother, gp)", len(result.Nodes))
	}
	depthByID := map[string]int{}
	byID := map[string]lineageNodePayload{}
	for _, n := range result.Nodes {
		depthByID[n.ID] = n.Depth
		byID[n.ID] = n
	}
	if depthByID[ids["gp"]] != 2 || depthByID[ids["father"]] != 1 {
		t.Errorf("unexpected depths: %+v", depthByID)
	}
	if result.Truncated {
		t.Error("small family must not be truncated")
	}
	gp := byID[ids["gp"]]
	if gp.FullLatin != "GP" || gp.FullNative != "GPn" || gp.Gender != "MALE" {
		t.Errorf("gp summary = %+v", gp)
	}
	if len(gp.Path) != 3 || gp.Path[0] != ids["child"] || gp.Path[1] != ids["father"] || gp.Path[2] != gp.ID {
		t.Errorf("gp path = %v", gp.Path)
	}
	if father := byID[ids["father"]]; father.FullLatin != "F GP" {
		t.Errorf("father full name = %q, want %q", father.FullLatin, "F GP")
	}
	if child := byID[ids["child"]]; len(child.Path) != 1 || child.Path[0] != child.ID {
		t.Errorf("root path = %v", child.Path)
	}
	if len(result.Unions) != 1 || result.Unions[0].Source != ids["father"] || result.Unions[0].Target != ids["mother"] {
		t.Errorf("unions = %+v", result.Unions)
	}

	rec = doRequest(t, r, http.MethodGet,
		"/api/v1/trees/"+treeID+"/analysis/lineage/"+ids["gp"]+"?direction=descendants&depth=1", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("descendants: status = %d", rec.Code)
	}
	var desc struct {
		Nodes []struct {
			ID string `json:"id"`
		} `json:"nodes"`
	}
	decodeBody(t, rec, &desc)
	if len(desc.Nodes) != 2 {
		t.Errorf("depth-1 descendants = %d, want 2 (gp, father)", len(desc.Nodes))
	}

	rec = doRequest(t, r, http.MethodGet,
		"/api/v1/trees/"+treeID+"/analysis/lineage/"+ids["child"]+"?direction=sideways", nil)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("bad direction: status = %d, want 400", rec.Code)
	}
}

func TestLineagePreservesSharedAncestorOccurrences(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "LinShared")
	ids := seedSmallFamily(t, r, treeID)
	// The grandparent also parents the mother. The focus person has two
	// distinct paths to that ancestor, so both occurrences must survive.
	rec := doRequest(t, r, http.MethodPost, "/api/v1/trees/"+treeID+"/relationships/parent-child",
		map[string]any{"parent_id": ids["gp"], "child_id": ids["mother"]})
	if rec.Code != http.StatusCreated {
		t.Fatalf("shared ancestor edge: status = %d, body = %s", rec.Code, rec.Body.String())
	}

	rec = doRequest(t, r, http.MethodGet,
		"/api/v1/trees/"+treeID+"/analysis/lineage/"+ids["child"]+"?direction=ancestors&depth=2", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("lineage: status = %d", rec.Code)
	}
	var result struct {
		Nodes []lineageNodePayload `json:"nodes"`
	}
	decodeBody(t, rec, &result)
	if len(result.Nodes) != 5 {
		t.Fatalf("ancestor nodes = %d, want 5 (child, father, mother, gp twice)", len(result.Nodes))
	}
	occurrences := 0
	paths := map[string]bool{}
	for _, n := range result.Nodes {
		if n.ID == ids["gp"] {
			occurrences++
			paths[strings.Join(n.Path, ">")] = true
		}
	}
	if occurrences != 2 {
		t.Errorf("gp occurrences = %d, want 2", occurrences)
	}
	if len(paths) != 2 {
		t.Errorf("gp paths = %v, want two distinct paths", paths)
	}
}

func TestLineageTerminatesOnCycles(t *testing.T) {
	_, manager, r := testSetup(t, 1)
	treeID := createTree(t, r, "LinCycle")
	a := createPerson(t, r, treeID, map[string]any{
		"given_name_native": "An", "given_name_latin": "A", "gender": "MALE"})
	b := createPerson(t, r, treeID, map[string]any{
		"given_name_native": "Bn", "given_name_latin": "B", "gender": "FEMALE"})
	db, err := manager.Tree(context.Background(), treeID)
	if err != nil {
		t.Fatal(err)
	}
	// Direct inserts model an imported graph that skipped relationship
	// validation. The traversal must break the cycle per path.
	for _, edge := range [][3]string{{"cycle-a", a, b}, {"cycle-b", b, a}} {
		if _, err := db.Exec(
			`INSERT INTO parent_child (id, parent_id, child_id) VALUES (?, ?, ?)`,
			edge[0], edge[1], edge[2]); err != nil {
			t.Fatal(err)
		}
	}

	rec := doRequest(t, r, http.MethodGet,
		"/api/v1/trees/"+treeID+"/analysis/lineage/"+a+"?direction=ancestors&depth=6", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("lineage: status = %d", rec.Code)
	}
	var result struct {
		Truncated bool                 `json:"truncated"`
		Nodes     []lineageNodePayload `json:"nodes"`
	}
	decodeBody(t, rec, &result)
	if len(result.Nodes) != 2 {
		t.Fatalf("cycle nodes = %d, want 2", len(result.Nodes))
	}
	for _, n := range result.Nodes {
		seen := map[string]bool{}
		for _, step := range n.Path {
			if seen[step] {
				t.Errorf("path revisits %s: %v", step, n.Path)
			}
			seen[step] = true
		}
	}
}

func TestLineageTruncatesLargeBranches(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "LinDeep")
	// A chain longer than the response budget proves truncation is reported
	// instead of leaving the client to guess.
	const people = 85
	ids := make([]string, people)
	for i := range ids {
		ids[i] = createPerson(t, r, treeID, map[string]any{
			"given_name_native": "N" + strconv.Itoa(i),
			"given_name_latin":  "P" + strconv.Itoa(i), "gender": "MALE"})
	}
	for i := 0; i < people-1; i++ {
		rec := doRequest(t, r, http.MethodPost, "/api/v1/trees/"+treeID+"/relationships/parent-child",
			map[string]any{"parent_id": ids[i+1], "child_id": ids[i]})
		if rec.Code != http.StatusCreated {
			t.Fatalf("chain edge %d: status = %d", i, rec.Code)
		}
	}

	rec := doRequest(t, r, http.MethodGet,
		"/api/v1/trees/"+treeID+"/analysis/lineage/"+ids[0]+"?direction=ancestors&depth=200", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("lineage: status = %d", rec.Code)
	}
	var result struct {
		Truncated bool                 `json:"truncated"`
		Nodes     []lineageNodePayload `json:"nodes"`
	}
	decodeBody(t, rec, &result)
	if !result.Truncated {
		t.Error("deep chain must report truncation")
	}
	if len(result.Nodes) != 80 {
		t.Fatalf("nodes = %d, want 80", len(result.Nodes))
	}
	if result.Nodes[0].ID != ids[0] {
		t.Errorf("first node = %s, want the focus person", result.Nodes[0].ID)
	}
	if last := result.Nodes[len(result.Nodes)-1]; last.Depth != 79 {
		t.Errorf("last depth = %d, want 79", last.Depth)
	}
}

func TestSubgraphEndpoint(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "Sub")
	ids := seedSmallFamily(t, r, treeID)

	rec := doRequest(t, r, http.MethodGet,
		"/api/v1/trees/"+treeID+"/graph/subgraph?root_id="+ids["child"]+"&depth=4", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("subgraph: status = %d", rec.Code)
	}
	var result struct {
		Nodes []struct {
			ID   string         `json:"id"`
			Data map[string]any `json:"data"`
		} `json:"nodes"`
		Edges []struct {
			Source string `json:"source"`
			Target string `json:"target"`
			Label  string `json:"label"`
		} `json:"edges"`
	}
	decodeBody(t, rec, &result)
	if len(result.Nodes) != 5 {
		t.Errorf("nodes = %d, want 5", len(result.Nodes))
	}
	// 4 parent edges plus 1 union edge.
	if len(result.Edges) != 5 {
		t.Errorf("edges = %d, want 5", len(result.Edges))
	}
	for _, n := range result.Nodes {
		if n.Data["full_latin"] == nil || n.Data["full_latin"] == "" {
			t.Errorf("node %s misses full_latin", n.ID)
		}
	}

	rec = doRequest(t, r, http.MethodGet,
		"/api/v1/trees/"+treeID+"/graph/subgraph", nil)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("missing root: status = %d, want 400", rec.Code)
	}
}

func TestSubgraphPersonSummaries(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "Summary")
	id := createPerson(t, r, treeID, map[string]any{
		"given_name_native": "N", "given_name_latin": "Abebe", "gender": "MALE",
		"birth_year_ec": 1998, "death_year_ec": 2016, "is_deceased": true,
	})

	rec := doRequest(t, r, http.MethodGet,
		"/api/v1/trees/"+treeID+"/graph/subgraph?root_id="+id+"&depth=1", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("subgraph: status = %d", rec.Code)
	}
	var result struct {
		Nodes []struct {
			Data map[string]any `json:"data"`
		} `json:"nodes"`
	}
	decodeBody(t, rec, &result)
	if len(result.Nodes) != 1 {
		t.Fatalf("nodes = %+v", result.Nodes)
	}
	data := result.Nodes[0].Data
	if data["birth_year_ec"] != float64(1998) ||
		data["death_year_ec"] != float64(2016) ||
		data["is_deceased"] != true {
		t.Errorf("summary = %+v", data)
	}
}
