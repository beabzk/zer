package api

import (
	"net/http"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestUpdateUnion(t *testing.T) {
	d, manager, _ := testSetup(t, 1)
	ownerRouter := chi.NewRouter()
	mount(ownerRouter, d, stubSession(1))
	viewerRouter := chi.NewRouter()
	mount(viewerRouter, d, stubSession(2))

	treeID := createTree(t, ownerRouter, "UnionEdit")
	addMembership(t, manager, treeID, 2, RoleViewer)
	a := createPerson(t, ownerRouter, treeID, map[string]any{
		"given_name_native": "A", "given_name_latin": "A", "gender": "MALE"})
	b := createPerson(t, ownerRouter, treeID, map[string]any{
		"given_name_native": "B", "given_name_latin": "B", "gender": "FEMALE"})
	unionPath := "/api/v1/trees/" + treeID + "/relationships/union"
	rec := doRequest(t, ownerRouter, http.MethodPost, unionPath, map[string]any{
		"partner_a_id": a, "partner_b_id": b})
	if rec.Code != http.StatusCreated {
		t.Fatalf("add union: status = %d", rec.Code)
	}

	// Partner order is insignificant for the lookup.
	rec = doRequest(t, ownerRouter, http.MethodPut, unionPath, map[string]any{
		"partner_a_id": b, "partner_b_id": a,
		"union_type": "CIVIL", "status": "DISSOLVED"})
	if rec.Code != http.StatusOK {
		t.Fatalf("update union: status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var updated map[string]any
	decodeBody(t, rec, &updated)
	if updated["union_type"] != "CIVIL" || updated["status"] != "DISSOLVED" {
		t.Fatalf("updated: %+v", updated)
	}

	for name, body := range map[string]map[string]any{
		"unknown type":   {"partner_a_id": a, "partner_b_id": b, "union_type": "SPACE"},
		"unknown status": {"partner_a_id": a, "partner_b_id": b, "status": "COMPLICATED"},
		"nothing to update": {"partner_a_id": a, "partner_b_id": b},
	} {
		if rec := doRequest(t, ownerRouter, http.MethodPut, unionPath, body); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d, want 400", name, rec.Code)
		}
	}
	if rec := doRequest(t, ownerRouter, http.MethodPut, unionPath, map[string]any{
		"partner_a_id": a, "partner_b_id": a, "status": "WIDOWED"}); rec.Code != http.StatusNotFound {
		t.Errorf("self pair: status = %d, want 404", rec.Code)
	}
	if rec := doRequest(t, viewerRouter, http.MethodPut, unionPath, map[string]any{
		"partner_a_id": a, "partner_b_id": b, "status": "WIDOWED"}); rec.Code != http.StatusForbidden {
		t.Errorf("viewer update: status = %d, want 403", rec.Code)
	}
}

func TestParentChildLifecycle(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "Edges")

	father := createPerson(t, r, treeID, map[string]any{
		"given_name_native": "Fn", "given_name_latin": "F", "gender": "MALE"})
	mother := createPerson(t, r, treeID, map[string]any{
		"given_name_native": "Mn", "given_name_latin": "M", "gender": "FEMALE"})
	child := createPerson(t, r, treeID, map[string]any{
		"given_name_native": "Cn", "given_name_latin": "C", "gender": "MALE"})

	edgePath := "/api/v1/trees/" + treeID + "/relationships/parent-child"
	rec := doRequest(t, r, http.MethodPost, edgePath, map[string]any{
		"parent_id": father, "child_id": child, "is_name_source": true})
	if rec.Code != http.StatusCreated {
		t.Fatalf("add edge: status = %d, body = %s", rec.Code, rec.Body.String())
	}
	rec = doRequest(t, r, http.MethodPost, edgePath, map[string]any{
		"parent_id": mother, "child_id": child})
	if rec.Code != http.StatusCreated {
		t.Fatalf("add second edge: status = %d", rec.Code)
	}

	row := getPerson(t, r, treeID, child, "")
	if row["full_latin"] != "C F" {
		t.Errorf("full_latin = %v, want C F", row["full_latin"])
	}

	// Switching the name source clears the previous one.
	rec = doRequest(t, r, http.MethodPut, edgePath, map[string]any{
		"parent_id": mother, "child_id": child, "is_name_source": true})
	if rec.Code != http.StatusOK {
		t.Fatalf("switch source: status = %d, body = %s", rec.Code, rec.Body.String())
	}
	row = getPerson(t, r, treeID, child, "")
	if row["full_latin"] != "C M" {
		t.Errorf("after switch full_latin = %v, want C M", row["full_latin"])
	}
}

func TestParentChildRejections(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "Reject")
	a := createPerson(t, r, treeID, map[string]any{
		"given_name_native": "A", "given_name_latin": "A", "gender": "MALE"})
	b := createPerson(t, r, treeID, map[string]any{
		"given_name_native": "B", "given_name_latin": "B", "gender": "FEMALE"})

	edgePath := "/api/v1/trees/" + treeID + "/relationships/parent-child"
	cases := []struct {
		name string
		body map[string]any
		want int
	}{
		{"self", map[string]any{"parent_id": a, "child_id": a}, http.StatusUnprocessableEntity},
		{"missing", map[string]any{"parent_id": "ghost", "child_id": b}, http.StatusUnprocessableEntity},
		{"bad type", map[string]any{"parent_id": a, "child_id": b, "relationship_type": "CLONE"}, http.StatusBadRequest},
	}
	for _, c := range cases {
		rec := doRequest(t, r, http.MethodPost, edgePath, c.body)
		if rec.Code != c.want {
			t.Errorf("%s: status = %d, want %d", c.name, rec.Code, c.want)
		}
	}

	rec := doRequest(t, r, http.MethodPost, edgePath, map[string]any{"parent_id": a, "child_id": b})
	if rec.Code != http.StatusCreated {
		t.Fatalf("seed edge: status = %d", rec.Code)
	}
	rec = doRequest(t, r, http.MethodPost, edgePath, map[string]any{"parent_id": a, "child_id": b})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("duplicate: status = %d, want 422", rec.Code)
	}
	rec = doRequest(t, r, http.MethodPost, edgePath, map[string]any{"parent_id": b, "child_id": a})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("cycle: status = %d, want 422", rec.Code)
	}
}

func TestUnionLifecycle(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "Unions")

	a := createPerson(t, r, treeID, map[string]any{
		"given_name_native": "A", "given_name_latin": "A", "gender": "MALE"})
	b := createPerson(t, r, treeID, map[string]any{
		"given_name_native": "B", "given_name_latin": "B", "gender": "FEMALE"})

	unionPath := "/api/v1/trees/" + treeID + "/relationships/union"
	rec := doRequest(t, r, http.MethodPost, unionPath, map[string]any{
		"partner_a_id": a, "partner_b_id": b})
	if rec.Code != http.StatusCreated {
		t.Fatalf("add union: status = %d, body = %s", rec.Code, rec.Body.String())
	}
	// Same pair in reverse order still conflicts.
	rec = doRequest(t, r, http.MethodPost, unionPath, map[string]any{
		"partner_a_id": b, "partner_b_id": a})
	if rec.Code != http.StatusConflict {
		t.Errorf("reverse duplicate: status = %d, want 409", rec.Code)
	}
	rec = doRequest(t, r, http.MethodPost, unionPath, map[string]any{
		"partner_a_id": a, "partner_b_id": a})
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("self union: status = %d, want 422", rec.Code)
	}
	rec = doRequest(t, r, http.MethodPost, unionPath, map[string]any{
		"partner_a_id": a, "partner_b_id": b, "union_type": "SPACE"})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("bad union type: status = %d, want 400", rec.Code)
	}
}
