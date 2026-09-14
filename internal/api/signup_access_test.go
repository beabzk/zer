package api

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestPublicAuthConfigReportsSetupRequired(t *testing.T) {
	d, _, _ := testSetup(t, 1)
	d.PasswordEnabled = true
	d.GoogleEnabled = false
	router := chi.NewRouter()
	mount(router, d, stubSession(1))

	rec := doRequest(t, router, http.MethodGet, "/api/v1/auth/config", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var body struct {
		SetupRequired   bool    `json:"setup_required"`
		SignupMode      *string `json:"signup_mode"`
		PasswordEnabled bool    `json:"password_enabled"`
		GoogleEnabled   bool    `json:"google_enabled"`
	}
	decodeBody(t, rec, &body)
	if !body.SetupRequired || body.SignupMode != nil || !body.PasswordEnabled || body.GoogleEnabled {
		t.Fatalf("unexpected config: %+v", body)
	}
}

func TestPublicAuthConfigReportsConfiguredMode(t *testing.T) {
	d, manager, _ := testSetup(t, 1)
	d.PasswordEnabled = false
	d.GoogleEnabled = true
	router := chi.NewRouter()
	mount(router, d, stubSession(1))
	ctx := context.Background()
	master, err := manager.Master(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := master.ExecContext(ctx,
		`INSERT INTO instance_settings (
			id, signup_mode, default_invite_expiry_hours, setup_completed_at, updated_at
		) VALUES (1, 'INVITE', 168, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}

	rec := doRequest(t, router, http.MethodGet, "/api/v1/auth/config", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var body struct {
		SetupRequired   bool   `json:"setup_required"`
		SignupMode      string `json:"signup_mode"`
		PasswordEnabled bool   `json:"password_enabled"`
		GoogleEnabled   bool   `json:"google_enabled"`
	}
	decodeBody(t, rec, &body)
	if body.SetupRequired || body.SignupMode != "INVITE" || body.PasswordEnabled || !body.GoogleEnabled {
		t.Fatalf("unexpected config: %+v", body)
	}
}

func TestDatabaseAdminIsRecognized(t *testing.T) {
	d, manager, _ := adminSetup(t, 0, "nobody@example.com")
	d.AdminEmails = map[string]bool{}
	ctx := context.Background()
	adminID := seedLimenUser(t, ctx, manager, "dbadmin@example.com")
	master, err := manager.Master(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := master.ExecContext(ctx,
		`INSERT INTO instance_admins (user_id, created_at)
		VALUES (?, '2026-01-01T00:00:00Z')`, adminID); err != nil {
		t.Fatal(err)
	}
	router := chi.NewRouter()
	mount(router, d, stubSessionAs(adminID, "dbadmin@example.com"))

	rec := doRequest(t, router, http.MethodGet, "/api/v1/admin/status", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var status map[string]bool
	decodeBody(t, rec, &status)
	if !status["is_admin"] {
		t.Fatalf("expected database admin, got %+v", status)
	}
}

func TestAdminSignupSettings(t *testing.T) {
	_, manager, _ := adminSetup(t, 0, adminEmail)
	ctx := context.Background()
	adminID := seedLimenUser(t, ctx, manager, adminEmail)
	adminRouter := chi.NewRouter()
	mount(adminRouter, Deps{
		Manager:     manager,
		AdminEmails: map[string]bool{adminEmail: true},
	}, stubSessionAs(adminID, adminEmail))

	rec := doRequest(t, adminRouter, http.MethodGet, "/api/v1/admin/signup-settings", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("get status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var settings struct {
		SignupMode               string `json:"signup_mode"`
		DefaultInviteExpiryHours int    `json:"default_invite_expiry_hours"`
	}
	decodeBody(t, rec, &settings)
	if settings.SignupMode != "INVITE" || settings.DefaultInviteExpiryHours != 168 {
		t.Fatalf("unexpected settings: %+v", settings)
	}

	rec = doRequest(t, adminRouter, http.MethodPut, "/api/v1/admin/signup-settings", map[string]any{
		"signupMode":               "CLOSED",
		"defaultInviteExpiryHours": 72,
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("put status = %d, body = %s", rec.Code, rec.Body.String())
	}
	decodeBody(t, rec, &settings)
	if settings.SignupMode != "CLOSED" || settings.DefaultInviteExpiryHours != 72 {
		t.Fatalf("unexpected updated settings: %+v", settings)
	}

	rec = doRequest(t, adminRouter, http.MethodPut, "/api/v1/admin/signup-settings", map[string]any{
		"signupMode":               "INVALID",
		"defaultInviteExpiryHours": 72,
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid update status = %d, want 400", rec.Code)
	}
}

func TestInviteLifecycle(t *testing.T) {
	_, manager, _ := adminSetup(t, 0, adminEmail)
	ctx := context.Background()
	adminID := seedLimenUser(t, ctx, manager, adminEmail)
	deps := Deps{
		Manager:     manager,
		AdminEmails: map[string]bool{adminEmail: true},
		BaseURL:     "http://localhost:8080",
	}
	router := chi.NewRouter()
	mount(router, deps, stubSessionAs(adminID, adminEmail))

	rec := doRequest(t, router, http.MethodPost, "/api/v1/admin/invites", map[string]any{
		"email":          "person@example.com",
		"expiresInHours": 24,
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var created struct {
		ID        string `json:"id"`
		Email     string `json:"email"`
		InviteURL string `json:"invite_url"`
	}
	decodeBody(t, rec, &created)
	if created.ID == "" || created.Email != "person@example.com" {
		t.Fatalf("unexpected invite: %+v", created)
	}
	if !strings.HasPrefix(created.InviteURL, "http://localhost:8080/signup#invite=") {
		t.Fatalf("unexpected invite URL: %s", created.InviteURL)
	}
	token := strings.TrimPrefix(created.InviteURL, "http://localhost:8080/signup#invite=")
	if token == "" {
		t.Fatal("invite URL has no token")
	}

	rec = doRequest(t, router, http.MethodGet, "/api/v1/admin/invites", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), token) {
		t.Fatal("admin invite list exposed the raw token")
	}

	publicRouter := chi.NewRouter()
	mount(publicRouter, deps, stubSession(0))
	rec = doRequest(t, publicRouter, http.MethodPost, "/api/v1/signup/invites/validate", map[string]string{
		"token": token,
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("validate status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var validation struct {
		Email string `json:"email"`
	}
	decodeBody(t, rec, &validation)
	if validation.Email != "person@example.com" {
		t.Fatalf("unexpected validation: %+v", validation)
	}

	rec = doRequest(t, router, http.MethodDelete, "/api/v1/admin/invites/"+created.ID, nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("revoke status = %d, body = %s", rec.Code, rec.Body.String())
	}
	rec = doRequest(t, publicRouter, http.MethodPost, "/api/v1/signup/invites/validate", map[string]string{
		"token": token,
	})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("revoked validate status = %d, want 403", rec.Code)
	}
}

func TestCreateInviteRejectsEmailInvalidAtSignup(t *testing.T) {
	_, manager, _ := adminSetup(t, 0, adminEmail)
	ctx := context.Background()
	adminID := seedLimenUser(t, ctx, manager, adminEmail)
	router := chi.NewRouter()
	mount(router, Deps{
		Manager:     manager,
		AdminEmails: map[string]bool{adminEmail: true},
	}, stubSessionAs(adminID, adminEmail))

	rec := doRequest(t, router, http.MethodPost, "/api/v1/admin/invites", map[string]any{
		"email": "person@example",
	})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("create status = %d, want 400, body = %s", rec.Code, rec.Body.String())
	}

	master, err := manager.Master(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var invites int
	if err := master.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM signup_invites WHERE email = 'person@example'`).Scan(&invites); err != nil {
		t.Fatal(err)
	}
	if invites != 0 {
		t.Fatalf("created %d invites for an invalid email", invites)
	}
}
