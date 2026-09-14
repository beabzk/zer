package auth

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/beabzk/zer/internal/database"
)

// TestSignupFlow drives real registration through the Limen handler: signup,
// session cookie, then an authenticated read. It covers the master DDL, the
// time-format adapter, and session persistence in one pass.
func TestSignupFlow(t *testing.T) {
	dir := filepath.Join("..", "..", "data", "testscratch", fmt.Sprintf("signup-%d", time.Now().UnixNano()))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })

	ctx := context.Background()
	m := database.NewManager(dir)
	defer m.Close()
	db, err := m.Master(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx,
		`INSERT INTO users (email, created_at, updated_at)
		VALUES ('existing@example.com', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx,
		`INSERT INTO instance_settings (
			id, signup_mode, default_invite_expiry_hours, setup_completed_at, updated_at
		) VALUES (1, 'OPEN', 168, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	t.Setenv("LIMEN_SECRET", "0123456789abcdef0123456789abcdef")
	engine, err := InitAuth(db, "http://localhost:8080", false, true)
	if err != nil {
		t.Fatal(err)
	}
	handler := engine.Handler()

	signup := httptest.NewRequest(http.MethodPost, "/auth/signup/credential",
		strings.NewReader(`{"email":"signup@example.com","password":"Secret123"}`))
	signup.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, signup)
	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("signup status = %d, body = %s", rec.Code, rec.Body.String())
	}
	cookies := rec.Result().Cookies()
	if len(cookies) == 0 {
		t.Fatal("signup set no session cookie")
	}

	me := httptest.NewRequest(http.MethodGet, "/auth/me", nil)
	for _, c := range cookies {
		me.AddCookie(c)
	}
	meRec := httptest.NewRecorder()
	handler.ServeHTTP(meRec, me)
	if meRec.Code != http.StatusOK {
		t.Fatalf("me status = %d, body = %s", meRec.Code, meRec.Body.String())
	}
	if !strings.Contains(meRec.Body.String(), "signup@example.com") {
		t.Fatalf("me body misses email: %s", meRec.Body.String())
	}
}

func TestFirstSignupCompletesSetup(t *testing.T) {
	dir := filepath.Join("..", "..", "data", "testscratch",
		fmt.Sprintf("first-signup-%d", time.Now().UnixNano()))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })

	ctx := context.Background()
	manager := database.NewManager(dir)
	defer manager.Close()
	db, err := manager.Master(ctx)
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("LIMEN_SECRET", "0123456789abcdef0123456789abcdef")
	engine, err := InitAuth(db, "http://localhost:8080", false, true)
	if err != nil {
		t.Fatal(err)
	}

	signup := httptest.NewRequest(http.MethodPost, "/auth/signup/credential",
		strings.NewReader(`{
			"email":"owner@example.com",
			"password":"Secret123",
			"additionalFields":{"purpose":"instance-setup","signupMode":"INVITE"}
		}`))
	signup.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	engine.Handler().ServeHTTP(rec, signup)
	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("setup status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var mode string
	var expiry int
	if err := db.QueryRowContext(ctx,
		`SELECT signup_mode, default_invite_expiry_hours FROM instance_settings WHERE id = 1`,
	).Scan(&mode, &expiry); err != nil {
		t.Fatalf("instance settings: %v", err)
	}
	if mode != "INVITE" || expiry != 168 {
		t.Fatalf("settings = %s/%d, want INVITE/168", mode, expiry)
	}

	var userID int64
	if err := db.QueryRowContext(ctx,
		`SELECT user_id FROM instance_admins`).Scan(&userID); err != nil {
		t.Fatalf("instance admin: %v", err)
	}
	if userID == 0 {
		t.Fatal("first user was not recorded as instance admin")
	}
}

func TestFirstSignupAcceptsLimenClientFlattenedFields(t *testing.T) {
	dir := filepath.Join("..", "..", "data", "testscratch",
		fmt.Sprintf("flattened-signup-%d", time.Now().UnixNano()))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })

	ctx := context.Background()
	manager := database.NewManager(dir)
	defer manager.Close()
	db, err := manager.Master(ctx)
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("LIMEN_SECRET", "0123456789abcdef0123456789abcdef")
	engine, err := InitAuth(db, "http://localhost:8080", false, true)
	if err != nil {
		t.Fatal(err)
	}

	signup := httptest.NewRequest(http.MethodPost, "/auth/signup/credential",
		strings.NewReader(`{
			"email":"owner@example.com",
			"password":"Secret123",
			"purpose":"instance-setup",
			"signupMode":"OPEN"
		}`))
	signup.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	engine.Handler().ServeHTTP(rec, signup)
	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("setup status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var mode string
	if err := db.QueryRowContext(ctx,
		`SELECT signup_mode FROM instance_settings WHERE id = 1`).Scan(&mode); err != nil {
		t.Fatalf("instance settings: %v", err)
	}
	if mode != "OPEN" {
		t.Fatalf("signup mode = %q, want OPEN", mode)
	}
}

func TestInviteSignupAcceptsMatchingEmail(t *testing.T) {
	dir := filepath.Join("..", "..", "data", "testscratch",
		fmt.Sprintf("invite-signup-%d", time.Now().UnixNano()))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })

	ctx := context.Background()
	manager := database.NewManager(dir)
	defer manager.Close()
	db, err := manager.Master(ctx)
	if err != nil {
		t.Fatal(err)
	}
	res, err := db.ExecContext(ctx,
		`INSERT INTO users (email, created_at, updated_at)
		VALUES ('admin@example.com', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`)
	if err != nil {
		t.Fatal(err)
	}
	adminID, err := res.LastInsertId()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx,
		`INSERT INTO instance_settings (
			id, signup_mode, default_invite_expiry_hours, setup_completed_at, updated_at
		) VALUES (1, 'INVITE', 168, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	token := "test-invite-token"
	tokenHash := sha256.Sum256([]byte(token))
	if _, err := db.ExecContext(ctx,
		`INSERT INTO signup_invites (
			id, email, token_hash, invited_by, expires_at, created_at
		) VALUES ('invite-1', 'person@example.com', ?, ?, '2030-01-01T00:00:00Z',
			'2026-01-01T00:00:00Z')`,
		hex.EncodeToString(tokenHash[:]), adminID); err != nil {
		t.Fatal(err)
	}

	t.Setenv("LIMEN_SECRET", "0123456789abcdef0123456789abcdef")
	engine, err := InitAuth(db, "http://localhost:8080", false, true)
	if err != nil {
		t.Fatal(err)
	}
	signup := httptest.NewRequest(http.MethodPost, "/auth/signup/credential",
		strings.NewReader(`{
			"email":"person@example.com",
			"password":"Secret123",
			"purpose":"signup",
			"inviteToken":"test-invite-token"
		}`))
	signup.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	engine.Handler().ServeHTTP(rec, signup)
	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("invite signup status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var acceptedBy int64
	var acceptedAt string
	if err := db.QueryRowContext(ctx,
		`SELECT accepted_by, accepted_at FROM signup_invites WHERE id = 'invite-1'`,
	).Scan(&acceptedBy, &acceptedAt); err != nil {
		t.Fatalf("invite acceptance: %v", err)
	}
	if acceptedBy == 0 || acceptedAt == "" {
		t.Fatalf("invite not accepted: user=%d accepted_at=%q", acceptedBy, acceptedAt)
	}
}

func TestFailedInviteSignupReleasesReservation(t *testing.T) {
	dir := filepath.Join("..", "..", "data", "testscratch",
		fmt.Sprintf("invite-release-%d", time.Now().UnixNano()))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })

	ctx := context.Background()
	manager := database.NewManager(dir)
	defer manager.Close()
	db, err := manager.Master(ctx)
	if err != nil {
		t.Fatal(err)
	}
	res, err := db.ExecContext(ctx,
		`INSERT INTO users (email, created_at, updated_at)
		VALUES ('admin@example.com', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`)
	if err != nil {
		t.Fatal(err)
	}
	adminID, err := res.LastInsertId()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx,
		`INSERT INTO instance_settings (
			id, signup_mode, default_invite_expiry_hours, setup_completed_at, updated_at
		) VALUES (1, 'INVITE', 168, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	token := "release-invite-token"
	tokenHash := sha256.Sum256([]byte(token))
	if _, err := db.ExecContext(ctx,
		`INSERT INTO signup_invites (
			id, email, token_hash, invited_by, expires_at, created_at
		) VALUES ('invite-1', 'person@example.com', ?, ?, '2030-01-01T00:00:00Z',
			'2026-01-01T00:00:00Z')`,
		hex.EncodeToString(tokenHash[:]), adminID); err != nil {
		t.Fatal(err)
	}

	t.Setenv("LIMEN_SECRET", "0123456789abcdef0123456789abcdef")
	engine, err := InitAuth(db, "http://localhost:8080", false, true)
	if err != nil {
		t.Fatal(err)
	}
	signup := httptest.NewRequest(http.MethodPost, "/auth/signup/credential",
		strings.NewReader(`{
			"email":"person@example.com",
			"password":"short",
			"additionalFields":{"purpose":"signup","inviteToken":"release-invite-token"}
		}`))
	signup.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	engine.Handler().ServeHTTP(rec, signup)
	if rec.Code == http.StatusOK || rec.Code == http.StatusCreated {
		t.Fatalf("weak password unexpectedly succeeded: %d", rec.Code)
	}

	var reservedAt sql.NullString
	if err := db.QueryRowContext(ctx,
		`SELECT reserved_at FROM signup_invites WHERE id = 'invite-1'`).Scan(&reservedAt); err != nil {
		t.Fatal(err)
	}
	if reservedAt.Valid {
		t.Fatal("failed signup left the invite reserved")
	}
}

func TestSignupPolicyCookieSecurityFollowsBaseURL(t *testing.T) {
	local := newSignupPolicy(nil, "http://localhost:8080", SignupPolicyOptions{})
	if local.secureCookies {
		t.Fatal("expected local HTTP cookies to avoid the Secure attribute")
	}
	public := newSignupPolicy(nil, "https://zer.example.com", SignupPolicyOptions{})
	if !public.secureCookies {
		t.Fatal("expected public HTTPS cookies to use the Secure attribute")
	}
}

func TestOAuthInviteClaimHelpers(t *testing.T) {
	dir := filepath.Join("..", "..", "data", "testscratch",
		fmt.Sprintf("oauth-invite-%d", time.Now().UnixNano()))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })

	ctx := context.Background()
	manager := database.NewManager(dir)
	defer manager.Close()
	db, err := manager.Master(ctx)
	if err != nil {
		t.Fatal(err)
	}
	res, err := db.ExecContext(ctx,
		`INSERT INTO users (email, created_at, updated_at)
		VALUES ('admin@example.com', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`)
	if err != nil {
		t.Fatal(err)
	}
	adminID, err := res.LastInsertId()
	if err != nil {
		t.Fatal(err)
	}
	token := "oauth-invite-token"
	tokenHash := sha256.Sum256([]byte(token))
	if _, err := db.ExecContext(ctx,
		`INSERT INTO signup_invites (
			id, email, token_hash, invited_by, expires_at, created_at
		) VALUES ('invite-1', 'google@example.com', ?, ?, '2030-01-01T00:00:00Z',
			'2026-01-01T00:00:00Z')`,
		hex.EncodeToString(tokenHash[:]), adminID); err != nil {
		t.Fatal(err)
	}

	policy := &signupPolicy{db: db}
	claim, err := policy.prepareOAuthInvite(token)
	if err != nil {
		t.Fatal(err)
	}
	if claim.Email != "google@example.com" || claim.UserID == 0 {
		t.Fatalf("unexpected claim: %+v", claim)
	}
	if !claim.CreatedUser {
		t.Fatal("expected a placeholder user to be created for the OAuth invite")
	}
	if err := policy.completeOAuthInvite(claim, claim.UserID, "other@example.com"); err == nil {
		t.Fatal("expected an email mismatch to reject the invite")
	}
	if err := policy.releaseOAuthInvite(claim); err != nil {
		t.Fatal(err)
	}

	var reservedAt sql.NullString
	if err := db.QueryRowContext(ctx,
		`SELECT reserved_at FROM signup_invites WHERE id = 'invite-1'`).Scan(&reservedAt); err != nil {
		t.Fatal(err)
	}
	if reservedAt.Valid {
		t.Fatal("expected the OAuth invite reservation to be released")
	}
	var users int
	if err := db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM users WHERE email = 'google@example.com'`).Scan(&users); err != nil {
		t.Fatal(err)
	}
	if users != 0 {
		t.Fatal("expected the unused OAuth placeholder user to be removed")
	}
	claim, err = policy.prepareOAuthInvite(token)
	if err != nil {
		t.Fatal(err)
	}
	if err := policy.completeOAuthInvite(claim, claim.UserID, "google@example.com"); err != nil {
		t.Fatal(err)
	}

	var acceptedBy int64
	if err := db.QueryRowContext(ctx,
		`SELECT accepted_by FROM signup_invites WHERE id = 'invite-1'`).Scan(&acceptedBy); err != nil {
		t.Fatal(err)
	}
	if acceptedBy != claim.UserID {
		t.Fatalf("accepted_by = %d, want %d", acceptedBy, claim.UserID)
	}
}

func TestCredentialSignupPolicyRejections(t *testing.T) {
	tests := []struct {
		name          string
		setupRequired bool
		baseURL       string
		adminEmails   map[string]bool
		signupMode    string
		inviteEmail   string
		inviteToken   string
		expiresAt     string
		signupEmail   string
		wantUsers     int
	}{
		{
			name:        "closed mode rejects signup",
			baseURL:     "http://localhost:8080",
			signupMode:  "CLOSED",
			signupEmail: "person@example.com",
			wantUsers:   1,
		},
		{
			name:        "invite mode rejects a missing token",
			baseURL:     "http://localhost:8080",
			signupMode:  "INVITE",
			signupEmail: "person@example.com",
			wantUsers:   1,
		},
		{
			name:        "invite mode rejects an email mismatch",
			baseURL:     "http://localhost:8080",
			signupMode:  "INVITE",
			inviteEmail: "invited@example.com",
			inviteToken: "invite-token",
			expiresAt:   "2030-01-01T00:00:00Z",
			signupEmail: "other@example.com",
			wantUsers:   1,
		},
		{
			name:        "invite mode rejects an expired token",
			baseURL:     "http://localhost:8080",
			signupMode:  "INVITE",
			inviteEmail: "person@example.com",
			inviteToken: "invite-token",
			expiresAt:   "2000-01-01T00:00:00Z",
			signupEmail: "person@example.com",
			wantUsers:   1,
		},
		{
			name:          "public first-run setup requires an operator email",
			setupRequired: true,
			baseURL:       "https://zer.example.com",
			adminEmails:   map[string]bool{"owner@example.com": true},
			signupMode:    "INVITE",
			signupEmail:   "other@example.com",
			wantUsers:     0,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			dir := filepath.Join("..", "..", "data", "testscratch",
				fmt.Sprintf("signup-policy-%s-%d", strings.ReplaceAll(test.name, " ", "-"), time.Now().UnixNano()))
			if err := os.MkdirAll(dir, 0o755); err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { os.RemoveAll(dir) })

			ctx := context.Background()
			manager := database.NewManager(dir)
			defer manager.Close()
			db, err := manager.Master(ctx)
			if err != nil {
				t.Fatal(err)
			}

			if !test.setupRequired {
				if _, err := db.ExecContext(ctx,
					`INSERT INTO users (email, created_at, updated_at)
					VALUES ('admin@example.com', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`); err != nil {
					t.Fatal(err)
				}
				if _, err := db.ExecContext(ctx,
					`INSERT INTO instance_settings (
						id, signup_mode, default_invite_expiry_hours, setup_completed_at, updated_at
					) VALUES (1, ?, 168, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
					test.signupMode); err != nil {
					t.Fatal(err)
				}
			}
			if test.inviteToken != "" {
				tokenHash := sha256.Sum256([]byte(test.inviteToken))
				if _, err := db.ExecContext(ctx,
					`INSERT INTO signup_invites (
						id, email, token_hash, invited_by, expires_at, created_at
					) VALUES ('invite-1', ?, ?, 1, ?, '2026-01-01T00:00:00Z')`,
					test.inviteEmail, hex.EncodeToString(tokenHash[:]), test.expiresAt); err != nil {
					t.Fatal(err)
				}
			}

			t.Setenv("LIMEN_SECRET", "0123456789abcdef0123456789abcdef")
			engine, err := InitAuthWithOptions(db, test.baseURL, false, true,
				SignupPolicyOptions{AdminEmails: test.adminEmails})
			if err != nil {
				t.Fatal(err)
			}
			payload := fmt.Sprintf(`{
				"email":%q,
				"password":"Secret123",
				"additionalFields":{"purpose":"signup","inviteToken":%q}
			}`, test.signupEmail, test.inviteToken)
			request := httptest.NewRequest(http.MethodPost, "/auth/signup/credential",
				strings.NewReader(payload))
			request.Header.Set("Content-Type", "application/json")
			recorder := httptest.NewRecorder()
			engine.Handler().ServeHTTP(recorder, request)
			if recorder.Code != http.StatusForbidden {
				t.Fatalf("status = %d, body = %s, want 403", recorder.Code, recorder.Body.String())
			}

			var users int
			if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&users); err != nil {
				t.Fatal(err)
			}
			if users != test.wantUsers {
				t.Fatalf("users = %d, want %d", users, test.wantUsers)
			}
		})
	}
}
