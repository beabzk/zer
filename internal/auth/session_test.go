package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/thecodearcher/limen"
)

func testEngine(t *testing.T) *limen.Limen {
	t.Helper()
	t.Setenv("LIMEN_SECRET", "0123456789abcdef0123456789abcdef")
	engine, err := InitAuth(openMemory(t), "http://localhost:8080", false, true)
	if err != nil {
		t.Fatal(err)
	}
	return engine
}

func TestRequireSessionRejectsAnonymous(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTeapot)
	})
	handler := RequireSession(testEngine(t))(next)

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/trees", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", rec.Code)
	}
}

func TestRequireSessionRejectsBadCookie(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTeapot)
	})
	handler := RequireSession(testEngine(t))(next)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/trees", nil)
	req.AddCookie(&http.Cookie{Name: "limen_session", Value: "forged"})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", rec.Code)
	}
}

func TestSessionFromRoundTrip(t *testing.T) {
	want := &limen.ValidatedSession{}
	ctx := context.WithValue(context.Background(), sessionKey{}, want)
	got, ok := SessionFrom(ctx)
	if !ok || got != want {
		t.Error("expected stored session back from context")
	}
	if _, ok := SessionFrom(context.Background()); ok {
		t.Error("expected no session in empty context")
	}
}
