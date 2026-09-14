package api

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/beabzk/zer/internal/database"
)

const adminEmail = "admin@example.com"

func adminSetup(t *testing.T, userID int64, email string) (Deps, *database.Manager, chi.Router) {
	t.Helper()
	dir := filepath.Join("..", "..", "data", "testscratch",
		fmt.Sprintf("%s-%d", t.Name(), time.Now().UnixNano()))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })

	manager := database.NewManager(dir)
	t.Cleanup(func() { manager.Close() })
	d := Deps{Manager: manager, AdminEmails: ParseAdminEmails(adminEmail)}
	r := chi.NewRouter()
	mount(r, d, stubSessionAs(userID, email))
	return d, manager, r
}

func seedUserWithState(t *testing.T, manager *database.Manager, email, treeID string) int64 {
	t.Helper()
	ctx := context.Background()
	id := seedLimenUser(t, ctx, manager, email)
	master, err := manager.Master(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := master.ExecContext(ctx,
		`INSERT INTO sessions (token, user_id, created_at, expires_at, last_access)
		VALUES (?, ?, ?, ?, ?)`,
		"tok-"+email, id, "2026-01-01T00:00:00Z", "2027-01-01T00:00:00Z", "2026-01-01T00:00:00Z"); err != nil {
		t.Fatal(err)
	}
	if _, err := master.ExecContext(ctx,
		`INSERT INTO accounts (user_id, provider, access_token, scope, created_at, updated_at)
		VALUES (?, 'google', 'tok', 'openid', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`, id); err != nil {
		t.Fatal(err)
	}
	if treeID != "" {
		addMembership(t, manager, treeID, id, RoleEditor)
	}
	return id
}

func countRows(t *testing.T, manager *database.Manager, query string, args ...any) int {
	t.Helper()
	master, err := manager.Master(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	var n int
	if err := master.QueryRowContext(context.Background(), query, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestAdminStatus(t *testing.T) {
	_, manager, adminRouter := adminSetup(t, 1, adminEmail)
	ctx := context.Background()
	seedLimenUser(t, ctx, manager, adminEmail)

	rec := doRequest(t, adminRouter, http.MethodGet, "/api/v1/admin/status", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status: %d", rec.Code)
	}
	var status map[string]bool
	decodeBody(t, rec, &status)
	if !status["is_admin"] {
		t.Errorf("expected is_admin true: %+v", status)
	}
}

func TestAdminListUsersCompletesWhileReadingUsers(t *testing.T) {
	_, manager, adminRouter := adminSetup(t, 1, adminEmail)
	seedLimenUser(t, context.Background(), manager, adminEmail)

	request := httptest.NewRequest(http.MethodGet, "/api/v1/admin/users", nil)
	ctx, cancel := context.WithTimeout(request.Context(), 200*time.Millisecond)
	defer cancel()
	request = request.WithContext(ctx)
	recorder := httptest.NewRecorder()
	adminRouter.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s, want 200", recorder.Code, recorder.Body.String())
	}
	var users []map[string]any
	decodeBody(t, recorder, &users)
	if len(users) != 1 || users[0]["email"] != adminEmail {
		t.Fatalf("users = %+v", users)
	}
}

func TestNonAdminBlocked(t *testing.T) {
	d, manager, _ := adminSetup(t, 0, "nobody@example.com")
	ctx := context.Background()
	ownerID := seedLimenUser(t, ctx, manager, "owner@example.com")
	ownerRouter := chi.NewRouter()
	mount(ownerRouter, d, stubSessionAs(ownerID, "owner@example.com"))
	strangerRouter := chi.NewRouter()
	mount(strangerRouter, d, stubSessionAs(99, "nobody@example.com"))

	treeID := createTree(t, ownerRouter, "Guarded")
	for _, tc := range []struct {
		method, path string
	}{
		{http.MethodGet, "/api/v1/admin/status"},
		{http.MethodGet, "/api/v1/admin/users"},
		{http.MethodGet, "/api/v1/admin/trees"},
		{http.MethodDelete, "/api/v1/admin/trees/" + treeID},
		{http.MethodDelete, "/api/v1/admin/users/1"},
	} {
		rec := doRequest(t, strangerRouter, tc.method, tc.path, nil)
		if rec.Code != http.StatusForbidden {
			t.Errorf("%s %s: status = %d, want 403", tc.method, tc.path, rec.Code)
		}
	}
}

func TestAdminBypassesMembership(t *testing.T) {
	d, manager, _ := adminSetup(t, 0, adminEmail)
	ctx := context.Background()
	seedLimenUser(t, ctx, manager, adminEmail)
	ownerID := seedLimenUser(t, ctx, manager, "owner@example.com")
	ownerRouter := chi.NewRouter()
	mount(ownerRouter, d, stubSessionAs(ownerID, "owner@example.com"))
	adminRouter := chi.NewRouter()
	mount(adminRouter, d, stubSessionAs(1, adminEmail))

	treeID := createTree(t, ownerRouter, "Walled")
	rec := doRequest(t, adminRouter, http.MethodGet, "/api/v1/trees/"+treeID+"/stats", nil)
	if rec.Code != http.StatusOK {
		t.Errorf("admin stats: status = %d, want 200", rec.Code)
	}
}

func TestAdminDeleteTree(t *testing.T) {
	d, manager, _ := adminSetup(t, 0, adminEmail)
	ctx := context.Background()
	seedLimenUser(t, ctx, manager, adminEmail)
	ownerID := seedLimenUser(t, ctx, manager, "owner@example.com")
	ownerRouter := chi.NewRouter()
	mount(ownerRouter, d, stubSessionAs(ownerID, "owner@example.com"))
	adminRouter := chi.NewRouter()
	mount(adminRouter, d, stubSessionAs(1, adminEmail))

	treeID := createTree(t, ownerRouter, "Doomed")
	createPerson(t, ownerRouter, treeID, map[string]any{
		"given_name_native": "N", "given_name_latin": "L", "gender": "MALE"})

	rec := doRequest(t, adminRouter, http.MethodDelete, "/api/v1/admin/trees/"+treeID, nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete tree: status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if n := countRows(t, manager, `SELECT COUNT(*) FROM trees WHERE id = ?`, treeID); n != 0 {
		t.Error("tree registry row remains")
	}
	if n := countRows(t, manager, `SELECT COUNT(*) FROM tree_members WHERE tree_id = ?`, treeID); n != 0 {
		t.Error("tree members remain")
	}
	// Reopening must yield a fresh database, proving the files were deleted.
	fresh, err := manager.Tree(ctx, treeID)
	if err != nil {
		t.Fatal(err)
	}
	var people int
	if err := fresh.QueryRowContext(ctx, `SELECT COUNT(*) FROM individuals`).Scan(&people); err != nil {
		t.Fatal(err)
	}
	if people != 0 {
		t.Errorf("reopened tree holds %d people, want fresh database", people)
	}
	rec = doRequest(t, adminRouter, http.MethodDelete, "/api/v1/admin/trees/"+treeID, nil)
	if rec.Code != http.StatusNotFound {
		t.Errorf("second delete: status = %d, want 404", rec.Code)
	}
}

func TestAdminDeleteUser(t *testing.T) {
	d, manager, _ := adminSetup(t, 0, adminEmail)
	ctx := context.Background()
	adminID := seedLimenUser(t, ctx, manager, adminEmail)
	adminRouter := chi.NewRouter()
	mount(adminRouter, d, stubSessionAs(adminID, adminEmail))

	// Victim owns a tree and holds sessions, accounts, memberships.
	master, err := manager.Master(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := master.ExecContext(ctx,
		`INSERT INTO trees (id, name, slug, created_by) VALUES ('t9', 'Orphan', 'orphan', 0)`); err != nil {
		t.Fatal(err)
	}
	victimID := seedUserWithState(t, manager, "victim@example.com", "t9")
	if _, err := master.ExecContext(ctx, `UPDATE trees SET created_by = ? WHERE id = 't9'`, victimID); err != nil {
		t.Fatal(err)
	}

	rec := doRequest(t, adminRouter, http.MethodDelete, fmt.Sprintf("/api/v1/admin/users/%d", victimID), nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete user: status = %d, body = %s", rec.Code, rec.Body.String())
	}
	for table, col := range map[string]string{
		"users": "id", "sessions": "user_id", "accounts": "user_id", "tree_members": "user_id",
	} {
		if n := countRows(t, manager, fmt.Sprintf(`SELECT COUNT(*) FROM %s WHERE %s = ?`, table, col), victimID); n != 0 {
			t.Errorf("%s rows remain for deleted user", table)
		}
	}
	var createdBy *int64
	if err := master.QueryRowContext(ctx, `SELECT created_by FROM trees WHERE id = 't9'`).Scan(&createdBy); err != nil {
		t.Fatal(err)
	}
	if createdBy != nil {
		t.Errorf("created_by not cleared: %d", *createdBy)
	}
	if n := countRows(t, manager, `SELECT COUNT(*) FROM trees WHERE id = 't9'`); n != 1 {
		t.Error("victim tree should survive orphaned")
	}
}

func TestAdminCannotDeleteSelf(t *testing.T) {
	d, manager, _ := adminSetup(t, 0, adminEmail)
	adminID := seedLimenUser(t, context.Background(), manager, adminEmail)
	adminRouter := chi.NewRouter()
	mount(adminRouter, d, stubSessionAs(adminID, adminEmail))

	rec := doRequest(t, adminRouter, http.MethodDelete, fmt.Sprintf("/api/v1/admin/users/%d", adminID), nil)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("self delete: status = %d, want 400", rec.Code)
	}
	if n := countRows(t, manager, `SELECT COUNT(*) FROM users WHERE id = ?`, adminID); n != 1 {
		t.Error("admin row removed by self delete")
	}
}
