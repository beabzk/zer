package auth

import (
	"context"
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
