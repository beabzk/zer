package api

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestTreeInvitationLifecycle(t *testing.T) {
	d, manager, _ := testSetup(t, 0)
	d.BaseURL = "http://localhost:8080"
	ctx := context.Background()
	ownerID := seedLimenUser(t, ctx, manager, "owner@example.com")
	inviteeID := seedLimenUser(t, ctx, manager, "invitee@example.com")
	wrongUserID := seedLimenUser(t, ctx, manager, "wrong@example.com")

	ownerRouter := chi.NewRouter()
	mount(ownerRouter, d, stubSessionAs(ownerID, "owner@example.com"))
	inviteeRouter := chi.NewRouter()
	mount(inviteeRouter, d, stubSessionAs(inviteeID, "invitee@example.com"))
	wrongRouter := chi.NewRouter()
	mount(wrongRouter, d, stubSessionAs(wrongUserID, "wrong@example.com"))

	treeID := createTree(t, ownerRouter, "Invited")
	rec := doRequest(t, ownerRouter, http.MethodPost, "/api/v1/trees/"+treeID+"/invitations", map[string]any{
		"email":          "invitee@example.com",
		"role":           RoleEditor,
		"expiresInHours": 24,
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var created struct {
		ID        string `json:"id"`
		Email     string `json:"email"`
		Role      string `json:"role"`
		Status    string `json:"status"`
		InviteURL string `json:"invite_url"`
	}
	decodeBody(t, rec, &created)
	if created.ID == "" || created.Email != "invitee@example.com" || created.Role != RoleEditor || created.Status != "PENDING" {
		t.Fatalf("unexpected invitation: %+v", created)
	}
	if !strings.HasPrefix(created.InviteURL, "http://localhost:8080/tree-invite#invite=") {
		t.Fatalf("unexpected invitation URL: %s", created.InviteURL)
	}
	token := strings.TrimPrefix(created.InviteURL, "http://localhost:8080/tree-invite#invite=")
	if token == "" {
		t.Fatal("invitation URL has no token")
	}

	rec = doRequest(t, ownerRouter, http.MethodGet, "/api/v1/trees/"+treeID+"/invitations", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), token) {
		t.Fatal("tree invitation list exposed the raw token")
	}

	rec = doRequest(t, inviteeRouter, http.MethodPost, "/api/v1/tree-invitations/validate", map[string]string{"token": token})
	if rec.Code != http.StatusOK {
		t.Fatalf("validate status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var validation struct {
		Email    string `json:"email"`
		TreeName string `json:"tree_name"`
		Role     string `json:"role"`
	}
	decodeBody(t, rec, &validation)
	if validation.Email != "invitee@example.com" || validation.TreeName != "Invited" || validation.Role != RoleEditor {
		t.Fatalf("unexpected validation: %+v", validation)
	}

	if rec := doRequest(t, wrongRouter, http.MethodPost, "/api/v1/tree-invitations/validate", map[string]string{"token": token}); rec.Code != http.StatusForbidden {
		t.Fatalf("wrong-user validate status = %d, want 403", rec.Code)
	}
	if rec := doRequest(t, wrongRouter, http.MethodPost, "/api/v1/tree-invitations/accept", map[string]string{"token": token}); rec.Code != http.StatusForbidden {
		t.Fatalf("wrong-user accept status = %d, want 403", rec.Code)
	}

	rec = doRequest(t, inviteeRouter, http.MethodPost, "/api/v1/tree-invitations/accept", map[string]string{"token": token})
	if rec.Code != http.StatusCreated {
		t.Fatalf("accept status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var member memberResponse
	decodeBody(t, rec, &member)
	if member.TreeID != treeID || member.UserID != inviteeID || member.Role != RoleEditor || member.Email != "invitee@example.com" {
		t.Fatalf("unexpected member: %+v", member)
	}

	if rec := doRequest(t, ownerRouter, http.MethodDelete,
		"/api/v1/trees/"+treeID+"/invitations/"+created.ID, nil); rec.Code != http.StatusConflict {
		t.Fatalf("revoke accepted status = %d, want 409", rec.Code)
	}
}

func TestTreeInvitationAndOwnerRolePolicy(t *testing.T) {
	d, manager, _ := testSetup(t, 0)
	ctx := context.Background()
	ownerID := seedLimenUser(t, ctx, manager, "owner@example.com")
	adminID := seedLimenUser(t, ctx, manager, "treeadmin@example.com")
	editorID := seedLimenUser(t, ctx, manager, "editor@example.com")
	targetID := seedLimenUser(t, ctx, manager, "target@example.com")

	ownerRouter := chi.NewRouter()
	mount(ownerRouter, d, stubSessionAs(ownerID, "owner@example.com"))
	treeID := createTree(t, ownerRouter, "Policy")
	addMembership(t, manager, treeID, adminID, RoleAdmin)
	addMembership(t, manager, treeID, editorID, RoleEditor)

	adminRouter := chi.NewRouter()
	mount(adminRouter, d, stubSessionAs(adminID, "treeadmin@example.com"))
	editorRouter := chi.NewRouter()
	mount(editorRouter, d, stubSessionAs(editorID, "editor@example.com"))

	if rec := doRequest(t, ownerRouter, http.MethodPost, "/api/v1/trees/"+treeID+"/members",
		map[string]any{"user_id": targetID, "role": RoleOwner}); rec.Code != http.StatusForbidden {
		t.Fatalf("direct owner grant status = %d, want 403", rec.Code)
	}
	if rec := doRequest(t, ownerRouter, http.MethodPost, "/api/v1/trees/"+treeID+"/invitations",
		map[string]any{"email": "target@example.com", "role": RoleOwner}); rec.Code != http.StatusBadRequest {
		t.Fatalf("owner invitation status = %d, want 400", rec.Code)
	}
	if rec := doRequest(t, ownerRouter, http.MethodPost, "/api/v1/trees/"+treeID+"/invitations",
		map[string]any{"email": "missing@example.com", "role": RoleViewer}); rec.Code != http.StatusNotFound {
		t.Fatalf("unknown user invitation status = %d, want 404", rec.Code)
	}
	if rec := doRequest(t, editorRouter, http.MethodPost, "/api/v1/trees/"+treeID+"/invitations",
		map[string]any{"email": "target@example.com", "role": RoleViewer}); rec.Code != http.StatusForbidden {
		t.Fatalf("editor invitation status = %d, want 403", rec.Code)
	}
	if rec := doRequest(t, adminRouter, http.MethodPost, "/api/v1/trees/"+treeID+"/invitations",
		map[string]any{"email": "target@example.com", "role": RoleAdmin}); rec.Code != http.StatusForbidden {
		t.Fatalf("admin grants admin status = %d, want 403", rec.Code)
	}
	if rec := doRequest(t, adminRouter, http.MethodPost, "/api/v1/trees/"+treeID+"/invitations",
		map[string]any{"email": "target@example.com", "role": RoleViewer}); rec.Code != http.StatusCreated {
		t.Fatalf("admin invites viewer status = %d, want 201, body = %s", rec.Code, rec.Body.String())
	}

	path := "/api/v1/trees/" + treeID + "/members/" + strconv.FormatInt(adminID, 10)
	if rec := doRequest(t, ownerRouter, http.MethodPut, path, map[string]any{"role": RoleOwner}); rec.Code != http.StatusOK {
		t.Fatalf("owner promotes admin status = %d, want 200, body = %s", rec.Code, rec.Body.String())
	}
}
