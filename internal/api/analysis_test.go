package api

import (
	"net/http"
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

	rec = doRequest(t, r, http.MethodGet,
		"/api/v1/trees/"+treeID+"/analysis/kinship?person_a="+ids["child"], nil)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("missing param: status = %d, want 400", rec.Code)
	}
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
		Nodes []struct {
			ID    string `json:"id"`
			Depth int    `json:"depth"`
		} `json:"nodes"`
	}
	decodeBody(t, rec, &result)
	if len(result.Nodes) != 4 {
		t.Fatalf("ancestor nodes = %d, want 4 (child, father, mother, gp)", len(result.Nodes))
	}
	depthByID := map[string]int{}
	for _, n := range result.Nodes {
		depthByID[n.ID] = n.Depth
	}
	if depthByID[ids["gp"]] != 2 || depthByID[ids["father"]] != 1 {
		t.Errorf("unexpected depths: %+v", depthByID)
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
