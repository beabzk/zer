package auth

import (
	"database/sql"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

func openMemory(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })
	return db
}

func TestInitPasswordOnly(t *testing.T) {
	t.Setenv("LIMEN_SECRET", "0123456789abcdef0123456789abcdef")
	a, err := InitAuth(openMemory(t), "http://localhost:8080", false, true)
	if err != nil {
		t.Fatal(err)
	}
	if a == nil {
		t.Error("expected auth engine")
	}
}

func TestInitGoogleOnly(t *testing.T) {
	t.Setenv("LIMEN_SECRET", "0123456789abcdef0123456789abcdef")
	t.Setenv("GOOGLE_CLIENT_ID", "test-client")
	t.Setenv("GOOGLE_CLIENT_SECRET", "test-secret")
	a, err := InitAuth(openMemory(t), "http://localhost:8080", true, false)
	if err != nil {
		t.Fatal(err)
	}
	if a == nil {
		t.Error("expected auth engine")
	}
}

func TestInitRejectsShortSecret(t *testing.T) {
	t.Setenv("LIMEN_SECRET", "too-short")
	if _, err := InitAuth(openMemory(t), "http://localhost:8080", false, true); err == nil {
		t.Error("expected error for short secret")
	} else if !strings.Contains(err.Error(), "32 bytes") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestInitRequiresOneMethod(t *testing.T) {
	t.Setenv("LIMEN_SECRET", "0123456789abcdef0123456789abcdef")
	if _, err := InitAuth(openMemory(t), "http://localhost:8080", false, false); err == nil {
		t.Error("expected error when both methods are disabled")
	}
}
