package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/thecodearcher/limen"

	"github.com/beabzk/zer/internal/auth"
	"github.com/beabzk/zer/internal/database"
)

func stubSession(userID int64) func(http.Handler) http.Handler {
	return stubSessionAs(userID, "test@example.com")
}

func stubSessionAs(userID int64, email string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			session := &limen.ValidatedSession{User: &limen.User{ID: userID, Email: email}}
			next.ServeHTTP(w, r.WithContext(auth.ContextWithSession(r.Context(), session)))
		})
	}
}

func testSetup(t *testing.T, userID int64) (Deps, *database.Manager, chi.Router) {
	t.Helper()
	dir := filepath.Join("..", "..", "data", "testscratch",
		fmt.Sprintf("%s-%d", t.Name(), time.Now().UnixNano()))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })

	manager := database.NewManager(dir)
	t.Cleanup(func() { manager.Close() })
	d := Deps{Manager: manager}
	r := chi.NewRouter()
	mount(r, d, stubSession(userID))
	return d, manager, r
}

// seedLimenUser inserts a Limen user row and returns its id.
func seedLimenUser(t *testing.T, ctx context.Context, manager *database.Manager, email string) int64 {
	t.Helper()
	master, err := manager.Master(ctx)
	if err != nil {
		t.Fatal(err)
	}
	res, err := master.ExecContext(ctx,
		`INSERT INTO users (email, created_at, updated_at) VALUES (?, ?, ?)`,
		email, "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z")
	if err != nil {
		t.Fatal(err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func doRequest(t *testing.T, r chi.Router, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var reader *bytes.Reader
	if body == nil {
		reader = bytes.NewReader(nil)
	} else {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = bytes.NewReader(raw)
	}
	req := httptest.NewRequest(method, path, reader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func decodeBody(t *testing.T, rec *httptest.ResponseRecorder, v any) {
	t.Helper()
	if err := json.NewDecoder(rec.Body).Decode(v); err != nil {
		t.Fatalf("decode %d response: %v", rec.Code, err)
	}
}

func TestHealthIsOpen(t *testing.T) {
	_, _, r := testSetup(t, 1)
	rec := doRequest(t, r, http.MethodGet, "/api/v1/health", nil)
	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", rec.Code)
	}
}
