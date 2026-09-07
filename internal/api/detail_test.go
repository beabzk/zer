package api

import (
	"net/http"
	"testing"

	"github.com/go-chi/chi/v5"
)

func getDetail(t *testing.T, r chi.Router, treeID, id, query string) (int, map[string]any) {
	t.Helper()
	rec := doRequest(t, r, http.MethodGet, "/api/v1/trees/"+treeID+"/individuals/"+id+"/detail"+query, nil)
	var body map[string]any
	decodeBody(t, rec, &body)
	return rec.Code, body
}

func linkParent(t *testing.T, r chi.Router, treeID, parentID, childID string) {
	t.Helper()
	rec := doRequest(t, r, http.MethodPost, "/api/v1/trees/"+treeID+"/relationships/parent-child",
		map[string]any{
			"parent_id": parentID, "child_id": childID,
			"relationship_type": "ADOPTIVE", "is_name_source": true,
		})
	if rec.Code != http.StatusCreated {
		t.Fatalf("link parent: status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func linkUnion(t *testing.T, r chi.Router, treeID, a, b string) {
	t.Helper()
	rec := doRequest(t, r, http.MethodPost, "/api/v1/trees/"+treeID+"/relationships/union",
		map[string]any{
			"partner_a_id": a, "partner_b_id": b,
			"union_type": "CIVIL", "status": "DISSOLVED",
		})
	if rec.Code != http.StatusCreated {
		t.Fatalf("link union: status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestPersonDetail(t *testing.T) {
	d, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "Detail")

	parent := createPerson(t, r, treeID, map[string]any{
		"given_name_native": "N-P", "given_name_latin": "Parent", "gender": "MALE"})
	child := createPerson(t, r, treeID, map[string]any{
		"given_name_native": "N-C", "given_name_latin": "Child", "gender": "FEMALE"})
	partner := createPerson(t, r, treeID, map[string]any{
		"given_name_native": "N-U", "given_name_latin": "Partner", "gender": "FEMALE"})
	linkParent(t, r, treeID, parent, child)
	linkUnion(t, r, treeID, parent, partner)
	insertEvent(t, d, treeID, "ev-detail", child, "BIRTH")

	code, body := getDetail(t, r, treeID, child, "")
	if code != http.StatusOK {
		t.Fatalf("detail: status = %d, body = %+v", code, body)
	}
	person, _ := body["individual"].(map[string]any)
	if person["id"] != child || person["full_latin"] != "Child Parent" {
		t.Errorf("individual: %+v, want synthesized Child Parent", person)
	}
	parents, _ := body["parents"].([]any)
	if len(parents) != 1 {
		t.Fatalf("parents: %+v", body["parents"])
	}
	edge, _ := parents[0].(map[string]any)
	if edge["id"] != parent || edge["relationship_type"] != "ADOPTIVE" || edge["is_name_source"] != true {
		t.Errorf("parent edge: %+v", edge)
	}
	children, _ := body["children"].([]any)
	if len(children) != 0 {
		t.Errorf("child has children: %+v", children)
	}
	perms, _ := body["permissions"].(map[string]any)
	if perms["can_edit"] != true || perms["can_delete"] != true {
		t.Errorf("owner permissions: %+v", perms)
	}

	code, parentBody := getDetail(t, r, treeID, parent, "?depth=1")
	if code != http.StatusOK {
		t.Fatalf("parent detail: status = %d", code)
	}
	kids, _ := parentBody["children"].([]any)
	if len(kids) != 1 {
		t.Fatalf("parent children: %+v", parentBody["children"])
	}
	kid, _ := kids[0].(map[string]any)
	if kid["id"] != child || kid["is_name_source"] != true {
		t.Errorf("child edge: %+v", kid)
	}
	unions, _ := parentBody["unions"].([]any)
	if len(unions) != 1 {
		t.Fatalf("parent unions: %+v", parentBody["unions"])
	}
	union, _ := unions[0].(map[string]any)
	if union["union_type"] != "CIVIL" || union["status"] != "DISSOLVED" {
		t.Errorf("union: %+v", union)
	}
	mate, _ := union["partner"].(map[string]any)
	if mate["id"] != partner || mate["full_latin"] != "Partner" {
		t.Errorf("union partner: %+v", mate)
	}
	events, _ := parentBody["events"].([]any)
	if len(events) != 0 {
		t.Errorf("parent events: %+v, want empty", events)
	}

	code, childBody := getDetail(t, r, treeID, child, "")
	childEvents, _ := childBody["events"].([]any)
	if code != http.StatusOK || len(childEvents) != 1 {
		t.Fatalf("child events: status = %d, %+v", code, childBody["events"])
	}
	ev, _ := childEvents[0].(map[string]any)
	if ev["event_type"] != "BIRTH" || ev["individual_id"] != child {
		t.Errorf("event: %+v", ev)
	}
}

func TestPersonDetailPermissions(t *testing.T) {
	d, manager, _ := testSetup(t, 1)
	ownerRouter := chi.NewRouter()
	mount(ownerRouter, d, stubSession(1))
	viewerRouter := chi.NewRouter()
	mount(viewerRouter, d, stubSession(2))

	treeID := createTree(t, ownerRouter, "Perms")
	addMembership(t, manager, treeID, 2, RoleViewer)
	person := createPerson(t, ownerRouter, treeID, map[string]any{
		"given_name_native": "N", "given_name_latin": "L", "gender": "MALE"})

	code, body := getDetail(t, viewerRouter, treeID, person, "")
	if code != http.StatusOK {
		t.Fatalf("viewer detail: status = %d", code)
	}
	perms, _ := body["permissions"].(map[string]any)
	if perms["can_edit"] != false || perms["can_delete"] != false {
		t.Errorf("viewer permissions: %+v, want false", perms)
	}

	code, ownerBody := getDetail(t, ownerRouter, treeID, person, "")
	if code != http.StatusOK {
		t.Fatalf("owner detail: status = %d", code)
	}
	ownerPerms, _ := ownerBody["permissions"].(map[string]any)
	if ownerPerms["can_edit"] != true || ownerPerms["can_delete"] != true {
		t.Errorf("owner permissions: %+v, want true", ownerPerms)
	}
}

func TestPersonDetailNotFound(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "Missing")

	if code, _ := getDetail(t, r, treeID, "no-such-id", ""); code != http.StatusNotFound {
		t.Errorf("missing: status = %d, want 404", code)
	}
}

func TestPersonDetailForbidden(t *testing.T) {
	d, _, _ := testSetup(t, 1)
	ownerRouter := chi.NewRouter()
	mount(ownerRouter, d, stubSession(1))
	strangerRouter := chi.NewRouter()
	mount(strangerRouter, d, stubSession(2))

	treeID := createTree(t, ownerRouter, "WalledDetail")
	person := createPerson(t, ownerRouter, treeID, map[string]any{
		"given_name_native": "N", "given_name_latin": "L", "gender": "MALE"})

	if code, _ := getDetail(t, strangerRouter, treeID, person, ""); code != http.StatusForbidden {
		t.Errorf("stranger: status = %d, want 403", code)
	}
}
