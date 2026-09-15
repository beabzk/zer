package api

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/beabzk/zer/internal/database"
)

func insertEvent(t *testing.T, d Deps, treeID, id, personID, eventType string) {
	t.Helper()
	db, err := d.Manager.Tree(context.Background(), treeID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(context.Background(),
		`INSERT INTO individual_events (id, individual_id, event_type, event_date_gc, event_place, description)
		VALUES (?, ?, ?, ?, ?, ?)`,
		id, personID, eventType, "2024-03-15", "Addis Ababa", "seeded"); err != nil {
		t.Fatal(err)
	}
}

func getOverview(t *testing.T, r chi.Router, treeID string) (int, map[string]any) {
	t.Helper()
	rec := doRequest(t, r, http.MethodGet, "/api/v1/trees/"+treeID+"/overview", nil)
	var body map[string]any
	decodeBody(t, rec, &body)
	return rec.Code, body
}

func TestTreeOverview(t *testing.T) {
	d, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "Overview")

	a := createPerson(t, r, treeID, map[string]any{
		"given_name_native": "N-A", "given_name_latin": "Abebe", "gender": "MALE",
		"birth_year_ec": 1998, "death_year_ec": 2016, "is_deceased": true})
	b := createPerson(t, r, treeID, map[string]any{
		"given_name_native": "N-B", "given_name_latin": "Aster", "gender": "FEMALE"})
	// Touch A after B so A is the most recently updated person.
	rec := doRequest(t, r, http.MethodPut, "/api/v1/trees/"+treeID+"/individuals/"+a,
		map[string]any{"birth_place": "Gondar"})
	if rec.Code != http.StatusOK {
		t.Fatalf("update: status = %d, body = %s", rec.Code, rec.Body.String())
	}
	insertEvent(t, d, treeID, "ev-1", b, "BIRTH")

	code, body := getOverview(t, r, treeID)
	if code != http.StatusOK {
		t.Fatalf("overview: status = %d, body = %+v", code, body)
	}
	tree, _ := body["tree"].(map[string]any)
	if tree["id"] != treeID || tree["name"] != "Overview" || tree["role"] != RoleOwner {
		t.Errorf("tree meta: %+v", tree)
	}
	counts, _ := body["counts"].(map[string]any)
	if counts["individuals"] != float64(2) || counts["events"] != float64(1) {
		t.Errorf("counts: %+v", counts)
	}
	recent, _ := body["recent_individuals"].([]any)
	if len(recent) != 2 {
		t.Fatalf("recent individuals: %+v", body["recent_individuals"])
	}
	first, _ := recent[0].(map[string]any)
	if first["id"] != a || first["full_latin"] != "Abebe" {
		t.Errorf("recent order: first = %+v, want Abebe", first)
	}
	if first["birth_year_ec"] != float64(1998) ||
		first["death_year_ec"] != float64(2016) ||
		first["is_deceased"] != true {
		t.Errorf("recent summary: %+v", first)
	}
	events, _ := body["recent_events"].([]any)
	if len(events) != 1 {
		t.Fatalf("recent events: %+v", body["recent_events"])
	}
	ev, _ := events[0].(map[string]any)
	if ev["event_type"] != "BIRTH" || ev["individual_id"] != b || ev["full_latin"] != "Aster" {
		t.Errorf("event: %+v", ev)
	}
}

func TestTreeOverviewEmpty(t *testing.T) {
	_, _, r := testSetup(t, 1)
	treeID := createTree(t, r, "Empty")

	code, body := getOverview(t, r, treeID)
	if code != http.StatusOK {
		t.Fatalf("overview: status = %d", code)
	}
	counts, _ := body["counts"].(map[string]any)
	for _, key := range []string{"individuals", "edges", "unions", "events", "members"} {
		if key == "members" {
			if counts[key] != float64(1) {
				t.Errorf("members = %v, want 1", counts[key])
			}
			continue
		}
		if counts[key] != float64(0) {
			t.Errorf("%s = %v, want 0", key, counts[key])
		}
	}
	if recent, _ := body["recent_individuals"].([]any); len(recent) != 0 {
		t.Errorf("recent individuals = %+v, want empty", recent)
	}
	if events, _ := body["recent_events"].([]any); len(events) != 0 {
		t.Errorf("recent events = %+v, want empty", events)
	}
}

func TestTreeOverviewForbidden(t *testing.T) {
	d, _, _ := testSetup(t, 1)
	ownerRouter := chi.NewRouter()
	mount(ownerRouter, d, stubSession(1))
	strangerRouter := chi.NewRouter()
	mount(strangerRouter, d, stubSession(2))

	treeID := createTree(t, ownerRouter, "Private")

	rec := doRequest(t, strangerRouter, http.MethodGet, "/api/v1/trees/"+treeID+"/overview", nil)
	if rec.Code != http.StatusForbidden {
		t.Errorf("outsider: status = %d, want 403", rec.Code)
	}
}

func TestAdminUnknownTreeReturnsNotFoundWithoutCreatingDatabase(t *testing.T) {
	dir := filepath.Join("..", "..", "data", "testscratch",
		fmt.Sprintf("unknown-tree-%d", time.Now().UnixNano()))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })

	manager := database.NewManager(dir)
	t.Cleanup(func() { manager.Close() })
	deps := Deps{
		Manager:     manager,
		AdminEmails: map[string]bool{"admin@example.com": true},
	}
	router := chi.NewRouter()
	mount(router, deps, stubSessionAs(1, "admin@example.com"))

	treeID := "11111111-1111-1111-1111-111111111111"
	rec := doRequest(t, router, http.MethodGet, "/api/v1/trees/"+treeID+"/overview", nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s, want 404", rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(filepath.Join(dir, "trees", treeID+".sqlite")); !os.IsNotExist(err) {
		t.Fatalf("unknown tree database was created: %v", err)
	}
}
