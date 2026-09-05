package api

import (
	"net/http"
	"testing"
)

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
