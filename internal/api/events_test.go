package api

import (
	"net/http"
	"testing"

	"github.com/go-chi/chi/v5"
)

func eventPath(treeID, personID string) string {
	return "/api/v1/trees/" + treeID + "/individuals/" + personID + "/events"
}

func createEvent(t *testing.T, r chi.Router, treeID, personID string, body map[string]any) map[string]any {
	t.Helper()
	rec := doRequest(t, r, http.MethodPost, eventPath(treeID, personID), body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create event: status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var row map[string]any
	decodeBody(t, rec, &row)
	if row["id"] == nil {
		t.Fatalf("missing id in %+v", row)
	}
	return row
}

func listEvents(t *testing.T, r chi.Router, treeID, personID string) []any {
	t.Helper()
	rec := doRequest(t, r, http.MethodGet, eventPath(treeID, personID), nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list events: status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var rows []any
	decodeBody(t, rec, &rows)
	return rows
}

func TestEventCRUD(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "Events")
	person := createPerson(t, r, treeID, map[string]any{
		"given_name_native": "N", "given_name_latin": "L", "gender": "MALE"})

	row := createEvent(t, r, treeID, person, map[string]any{
		"event_type": "GRADUATION", "event_date_gc": "2002-06-27",
		"event_year_ec": 1994, "event_place": "Addis Ababa", "description": "University",
	})
	if row["event_type"] != "GRADUATION" || row["individual_id"] != person {
		t.Fatalf("created: %+v", row)
	}

	rows := listEvents(t, r, treeID, person)
	if len(rows) != 1 {
		t.Fatalf("list: %+v", rows)
	}

	id, _ := row["id"].(string)
	rec := doRequest(t, r, http.MethodPut, eventPath(treeID, person)+"/"+id,
		map[string]any{"event_place": "Gondar", "description": "Updated"})
	if rec.Code != http.StatusOK {
		t.Fatalf("update: status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var updated map[string]any
	decodeBody(t, rec, &updated)
	if updated["event_place"] != "Gondar" || updated["description"] != "Updated" {
		t.Fatalf("updated: %+v", updated)
	}
	if updated["event_type"] != "GRADUATION" {
		t.Fatalf("type changed: %+v", updated)
	}

	rec = doRequest(t, r, http.MethodDelete, eventPath(treeID, person)+"/"+id, nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete: status = %d", rec.Code)
	}
	if rows := listEvents(t, r, treeID, person); len(rows) != 0 {
		t.Fatalf("after delete: %+v", rows)
	}
}

func TestEventValidation(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "EventValid")
	person := createPerson(t, r, treeID, map[string]any{
		"given_name_native": "N", "given_name_latin": "L", "gender": "MALE"})

	for name, body := range map[string]map[string]any{
		"missing type":      {},
		"blank type":        {"event_type": "  "},
		"bad GC date":       {"event_type": "X", "event_date_gc": "2023-02-29"},
		"malformed GC date": {"event_type": "X", "event_date_gc": "not-a-date"},
		"bad EC year":       {"event_type": "X", "event_year_ec": 0},
	} {
		rec := doRequest(t, r, http.MethodPost, eventPath(treeID, person), body)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d, want 400", name, rec.Code)
		}
	}

	id, _ := createEvent(t, r, treeID, person, map[string]any{"event_type": "BIRTH"})["id"].(string)
	rec := doRequest(t, r, http.MethodPut, eventPath(treeID, person)+"/"+id,
		map[string]any{"event_date_gc": "2024-13-01"})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("bad update date: status = %d, want 400", rec.Code)
	}
}

func TestEventNotFound(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "EventMissing")
	person := createPerson(t, r, treeID, map[string]any{
		"given_name_native": "N", "given_name_latin": "L", "gender": "MALE"})

	if rec := doRequest(t, r, http.MethodGet, eventPath(treeID, "no-such-id"), nil); rec.Code != http.StatusNotFound {
		t.Errorf("list missing person: status = %d, want 404", rec.Code)
	}
	if rec := doRequest(t, r, http.MethodPost, eventPath(treeID, "no-such-id"),
		map[string]any{"event_type": "X"}); rec.Code != http.StatusNotFound {
		t.Errorf("create missing person: status = %d, want 404", rec.Code)
	}
	if rec := doRequest(t, r, http.MethodPut, eventPath(treeID, person)+"/no-such-ev",
		map[string]any{"event_place": "X"}); rec.Code != http.StatusNotFound {
		t.Errorf("update missing: status = %d, want 404", rec.Code)
	}
	if rec := doRequest(t, r, http.MethodDelete, eventPath(treeID, person)+"/no-such-ev", nil); rec.Code != http.StatusNotFound {
		t.Errorf("delete missing: status = %d, want 404", rec.Code)
	}
}

func TestEventRoleEnforcement(t *testing.T) {
	d, manager, _ := testSetup(t, 1)
	ownerRouter := chi.NewRouter()
	mount(ownerRouter, d, stubSession(1))
	viewerRouter := chi.NewRouter()
	mount(viewerRouter, d, stubSession(2))

	treeID := createTree(t, ownerRouter, "EventRoles")
	addMembership(t, manager, treeID, 2, RoleViewer)
	person := createPerson(t, ownerRouter, treeID, map[string]any{
		"given_name_native": "N", "given_name_latin": "L", "gender": "MALE"})

	if rec := doRequest(t, viewerRouter, http.MethodPost, eventPath(treeID, person),
		map[string]any{"event_type": "X"}); rec.Code != http.StatusForbidden {
		t.Errorf("viewer create: status = %d, want 403", rec.Code)
	}
	if rec := doRequest(t, viewerRouter, http.MethodGet, eventPath(treeID, person), nil); rec.Code != http.StatusOK {
		t.Errorf("viewer list: status = %d, want 200", rec.Code)
	}
}
