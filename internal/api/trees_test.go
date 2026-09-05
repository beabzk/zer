package api

import (
	"context"
	"net/http"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/beabzk/zer/internal/database"
)

func createTree(t *testing.T, r chi.Router, name string) string {
	t.Helper()
	rec := doRequest(t, r, http.MethodPost, "/api/v1/trees", map[string]any{"name": name})
	if rec.Code != http.StatusCreated {
		t.Fatalf("create tree %s: status = %d, body = %s", name, rec.Code, rec.Body.String())
	}
	var tr treeResponse
	decodeBody(t, rec, &tr)
	if tr.ID == "" || tr.Role != RoleOwner {
		t.Fatalf("unexpected tree response: %+v", tr)
	}
	return tr.ID
}

func addMembership(t *testing.T, manager *database.Manager, treeID string, userID int64, role string) {
	t.Helper()
	master, err := manager.Master(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := master.ExecContext(context.Background(),
		`INSERT INTO tree_members (id, tree_id, user_id, role) VALUES (?, ?, ?, ?)`,
		"test-"+role, treeID, userID, role); err != nil {
		t.Fatal(err)
	}
}

func TestCreateListStatsTrees(t *testing.T) {
	_, _, r := testSetup(t, 1)

	id := createTree(t, r, "Demo Lineage")

	rec := doRequest(t, r, http.MethodGet, "/api/v1/trees", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list: status = %d", rec.Code)
	}
	var trees []treeResponse
	decodeBody(t, rec, &trees)
	if len(trees) != 1 || trees[0].ID != id || trees[0].Slug != "demo-lineage" {
		t.Fatalf("unexpected list: %+v", trees)
	}

	rec = doRequest(t, r, http.MethodGet, "/api/v1/trees/"+id+"/stats", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("stats: status = %d", rec.Code)
	}
	var stats map[string]any
	decodeBody(t, rec, &stats)
	if stats["members"] != float64(1) || stats["individuals"] != float64(0) {
		t.Fatalf("unexpected stats: %+v", stats)
	}
}

func TestCreateTreeValidation(t *testing.T) {
	_, _, r := testSetup(t, 1)

	rec := doRequest(t, r, http.MethodPost, "/api/v1/trees", map[string]any{"name": ""})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("empty name: status = %d, want 400", rec.Code)
	}
	createTree(t, r, "Dup")
	rec = doRequest(t, r, http.MethodPost, "/api/v1/trees", map[string]any{"name": "Dup"})
	if rec.Code != http.StatusConflict {
		t.Errorf("duplicate slug: status = %d, want 409", rec.Code)
	}
}

func TestTreeMembershipEnforcement(t *testing.T) {
	d, manager, _ := testSetup(t, 1)
	ownerRouter := chi.NewRouter()
	mount(ownerRouter, d, stubSession(1))
	strangerRouter := chi.NewRouter()
	mount(strangerRouter, d, stubSession(2))

	ctx := context.Background()
	seedLimenUser(t, ctx, manager, "owner@example.com")
	seedLimenUser(t, ctx, manager, "stranger@example.com")

	id := createTree(t, ownerRouter, "Walled")

	rec := doRequest(t, strangerRouter, http.MethodGet, "/api/v1/trees/"+id+"/stats", nil)
	if rec.Code != http.StatusForbidden {
		t.Errorf("stranger stats: status = %d, want 403", rec.Code)
	}
	rec = doRequest(t, strangerRouter, http.MethodGet, "/api/v1/trees", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("stranger list: status = %d", rec.Code)
	}
	var trees []treeResponse
	decodeBody(t, rec, &trees)
	if len(trees) != 0 {
		t.Errorf("stranger sees %d trees, want 0", len(trees))
	}
}

func TestAddMemberRules(t *testing.T) {
	d, manager, _ := testSetup(t, 0)
	ctx := context.Background()
	ownerID := seedLimenUser(t, ctx, manager, "owner@example.com")
	editorID := seedLimenUser(t, ctx, manager, "editor@example.com")
	viewerID := seedLimenUser(t, ctx, manager, "viewer@example.com")

	ownerRouter := chi.NewRouter()
	mount(ownerRouter, d, stubSession(ownerID))
	editorRouter := chi.NewRouter()
	mount(editorRouter, d, stubSession(editorID))
	viewerRouter := chi.NewRouter()
	mount(viewerRouter, d, stubSession(viewerID))

	id := createTree(t, ownerRouter, "Roles")

	// Owner invites editor and viewer.
	for _, tc := range []struct {
		user int64
		role string
	}{
		{editorID, RoleEditor},
		{viewerID, RoleViewer},
	} {
		rec := doRequest(t, ownerRouter, http.MethodPost, "/api/v1/trees/"+id+"/members",
			map[string]any{"user_id": tc.user, "role": tc.role})
		if rec.Code != http.StatusCreated {
			t.Fatalf("invite %d: status = %d, body = %s", tc.user, rec.Code, rec.Body.String())
		}
	}

	rec := doRequest(t, ownerRouter, http.MethodPost, "/api/v1/trees/"+id+"/members",
		map[string]any{"user_id": editorID, "role": RoleEditor})
	if rec.Code != http.StatusConflict {
		t.Errorf("duplicate invite: status = %d, want 409", rec.Code)
	}

	rec = doRequest(t, ownerRouter, http.MethodPost, "/api/v1/trees/"+id+"/members",
		map[string]any{"user_id": 9999, "role": RoleViewer})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("unknown user: status = %d, want 400", rec.Code)
	}

	// Editor cannot invite, viewer cannot create individuals.
	rec = doRequest(t, editorRouter, http.MethodPost, "/api/v1/trees/"+id+"/members",
		map[string]any{"user_id": viewerID, "role": RoleViewer})
	if rec.Code != http.StatusForbidden {
		t.Errorf("editor invite: status = %d, want 403", rec.Code)
	}
	rec = doRequest(t, viewerRouter, http.MethodPost, "/api/v1/trees/"+id+"/individuals",
		map[string]any{"given_name_native": "A", "given_name_latin": "A", "gender": "MALE"})
	if rec.Code != http.StatusForbidden {
		t.Errorf("viewer write: status = %d, want 403", rec.Code)
	}
}
