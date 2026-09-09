package api

import (
	"context"
	"net/http"
	"strconv"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/beabzk/zer/internal/database"
)

func memberPath(treeID string) string {
	return "/api/v1/trees/" + treeID + "/members"
}

func listMembers(t *testing.T, r chi.Router, treeID string) (int, []map[string]any) {
	t.Helper()
	rec := doRequest(t, r, http.MethodGet, memberPath(treeID), nil)
	var rows []map[string]any
	if rec.Code == http.StatusOK {
		decodeBody(t, rec, &rows)
	}
	return rec.Code, rows
}

func memberSetup(t *testing.T) (Deps, *database.Manager, chi.Router, chi.Router, string, int64) {
	t.Helper()
	d, manager, _ := testSetup(t, 1)
	// The owner needs a real users row so seeded ids never collide
	// with the membership rows keyed by session user id.
	ownerID := seedLimenUser(t, context.Background(), manager, "owner@example.com")
	ownerRouter := chi.NewRouter()
	mount(ownerRouter, d, stubSession(ownerID))
	treeID := createTree(t, ownerRouter, "Members")
	editorID := seedLimenUser(t, context.Background(), manager, "editor@example.com")
	addMembership(t, manager, treeID, editorID, RoleEditor)
	editorRouter := chi.NewRouter()
	mount(editorRouter, d, stubSession(editorID))
	return d, manager, ownerRouter, editorRouter, treeID, editorID
}

func TestMemberLifecycle(t *testing.T) {
	_, _, ownerRouter, _, treeID, editorID := memberSetup(t)

	code, rows := listMembers(t, ownerRouter, treeID)
	if code != http.StatusOK {
		t.Fatalf("list: status = %d", code)
	}
	if len(rows) != 2 {
		t.Fatalf("members: %+v, want owner plus editor", rows)
	}
	byUser := map[float64]map[string]any{}
	for _, row := range rows {
		id, _ := row["user_id"].(float64)
		byUser[id] = row
	}
	editor, ok := byUser[float64(editorID)]
	if !ok || editor["email"] != "editor@example.com" || editor["role"] != RoleEditor {
		t.Fatalf("editor entry: %+v", byUser)
	}
	if editor["created_at"] == nil || editor["created_at"] == "" {
		t.Errorf("missing created_at: %+v", editor)
	}
}

func TestMemberAddReturnsStableMetadata(t *testing.T) {
	_, manager, ownerRouter, _, treeID, _ := memberSetup(t)
	inviteeID := seedLimenUser(t, context.Background(), manager, "invitee@example.com")
	rec := doRequest(t, ownerRouter, http.MethodPost, memberPath(treeID), map[string]any{
		"user_id": inviteeID,
		"role":    RoleViewer,
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("add: status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var member memberResponse
	decodeBody(t, rec, &member)
	if member.TreeID != treeID || member.UserID != inviteeID || member.Role != RoleViewer || member.Email != "invitee@example.com" {
		t.Fatalf("member: %+v", member)
	}
	if member.CreatedAt == "" {
		t.Fatal("member created_at is empty")
	}
}

func TestMemberRoleUpdate(t *testing.T) {
	_, _, ownerRouter, _, treeID, editorID := memberSetup(t)

	path := memberPath(treeID) + "/" + strconv.FormatInt(editorID, 10)
	rec := doRequest(t, ownerRouter, http.MethodPut, path, map[string]any{"role": RoleViewer})
	if rec.Code != http.StatusOK {
		t.Fatalf("demote: status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var updated map[string]any
	decodeBody(t, rec, &updated)
	if updated["role"] != RoleViewer || updated["user_id"] != float64(editorID) {
		t.Fatalf("updated: %+v", updated)
	}

	if rec := doRequest(t, ownerRouter, http.MethodPut, path, map[string]any{"role": "SUPER"}); rec.Code != http.StatusBadRequest {
		t.Errorf("unknown role: status = %d, want 400", rec.Code)
	}
	if rec := doRequest(t, ownerRouter, http.MethodPut, memberPath(treeID)+"/9999",
		map[string]any{"role": RoleViewer}); rec.Code != http.StatusNotFound {
		t.Errorf("missing member: status = %d, want 404", rec.Code)
	}
	if rec := doRequest(t, ownerRouter, http.MethodPut, path, map[string]any{}); rec.Code != http.StatusBadRequest {
		t.Errorf("empty body: status = %d, want 400", rec.Code)
	}
}

func TestMemberRemoval(t *testing.T) {
	_, _, ownerRouter, _, treeID, editorID := memberSetup(t)

	rec := doRequest(t, ownerRouter, http.MethodDelete, memberPath(treeID)+"/"+strconv.FormatInt(editorID, 10), nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("remove: status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if code, rows := listMembers(t, ownerRouter, treeID); code != http.StatusOK || len(rows) != 1 {
		t.Fatalf("after remove: status = %d, %+v", code, rows)
	}
	if rec := doRequest(t, ownerRouter, http.MethodDelete, memberPath(treeID)+"/9999", nil); rec.Code != http.StatusNotFound {
		t.Errorf("missing member: status = %d, want 404", rec.Code)
	}
}

func TestMemberLastOwnerGuard(t *testing.T) {
	d, manager, _ := testSetup(t, 1)
	ownerID := seedLimenUser(t, context.Background(), manager, "owner@example.com")
	ownerRouter := chi.NewRouter()
	mount(ownerRouter, d, stubSession(ownerID))
	treeID := createTree(t, ownerRouter, "Owned")
	ownerPath := memberPath(treeID) + "/" + strconv.FormatInt(ownerID, 10)

	if rec := doRequest(t, ownerRouter, http.MethodPut, ownerPath,
		map[string]any{"role": RoleViewer}); rec.Code != http.StatusConflict {
		t.Errorf("demote last owner: status = %d, want 409", rec.Code)
	}
	if rec := doRequest(t, ownerRouter, http.MethodDelete, ownerPath, nil); rec.Code != http.StatusConflict {
		t.Errorf("remove last owner: status = %d, want 409", rec.Code)
	}

	second := seedLimenUser(t, context.Background(), manager, "second@example.com")
	addMembership(t, manager, treeID, second, RoleOwner)
	if rec := doRequest(t, ownerRouter, http.MethodPut, ownerPath,
		map[string]any{"role": RoleViewer}); rec.Code != http.StatusOK {
		t.Fatalf("demote with backup owner: status = %d", rec.Code)
	}
}

func TestMemberRoleEnforcement(t *testing.T) {
	d, manager, ownerRouter, editorRouter, treeID, editorID := memberSetup(t)

	if code, _ := listMembers(t, editorRouter, treeID); code != http.StatusForbidden {
		t.Errorf("editor list: status = %d, want 403", code)
	}
	target := memberPath(treeID) + "/" + strconv.FormatInt(editorID, 10)
	if rec := doRequest(t, editorRouter, http.MethodPut, target,
		map[string]any{"role": RoleViewer}); rec.Code != http.StatusForbidden {
		t.Errorf("editor update: status = %d, want 403", rec.Code)
	}
	if rec := doRequest(t, editorRouter, http.MethodDelete, target, nil); rec.Code != http.StatusForbidden {
		t.Errorf("editor remove: status = %d, want 403", rec.Code)
	}

	// Admins cannot touch owners or grant the owner role.
	adminID := seedLimenUser(t, context.Background(), manager, "admin2@example.com")
	addMembership(t, manager, treeID, adminID, RoleAdmin)
	peerAdminID := seedLimenUser(t, context.Background(), manager, "admin3@example.com")
	master, err := manager.Master(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := master.ExecContext(context.Background(),
		`INSERT INTO tree_members (id, tree_id, user_id, role) VALUES (?, ?, ?, ?)`,
		"peer-admin", treeID, peerAdminID, RoleAdmin); err != nil {
		t.Fatal(err)
	}
	adminRouter := chi.NewRouter()
	mount(adminRouter, d, stubSession(adminID))
	if rec := doRequest(t, adminRouter, http.MethodPut, memberPath(treeID)+"/1",
		map[string]any{"role": RoleViewer}); rec.Code != http.StatusForbidden {
		t.Errorf("admin demotes owner: status = %d, want 403", rec.Code)
	}
	if rec := doRequest(t, adminRouter, http.MethodPut, target,
		map[string]any{"role": RoleOwner}); rec.Code != http.StatusForbidden {
		t.Errorf("admin grants owner: status = %d, want 403", rec.Code)
	}
	if rec := doRequest(t, adminRouter, http.MethodPut, target,
		map[string]any{"role": RoleViewer}); rec.Code != http.StatusOK {
		t.Errorf("admin demotes editor: status = %d, want 200", rec.Code)
	}
	peerPath := memberPath(treeID) + "/" + strconv.FormatInt(peerAdminID, 10)
	if rec := doRequest(t, adminRouter, http.MethodPut, peerPath,
		map[string]any{"role": RoleViewer}); rec.Code != http.StatusForbidden {
		t.Errorf("admin demotes peer admin: status = %d, want 403", rec.Code)
	}
	if rec := doRequest(t, adminRouter, http.MethodDelete, peerPath, nil); rec.Code != http.StatusForbidden {
		t.Errorf("admin removes peer admin: status = %d, want 403", rec.Code)
	}
	_ = ownerRouter
}
