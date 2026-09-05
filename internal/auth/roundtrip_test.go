package auth

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/thecodearcher/limen"
	sqladapter "github.com/thecodearcher/limen/adapters/sql"

	"github.com/beabzk/zer/internal/database"
)

// TestSessionRoundTrip writes a session row with time.Time values through
// the real Limen SQL adapter and reads it back. modernc.org/sqlite returns
// TEXT columns as strings, so this fails if the stored timestamp format
// does not match the adapter parse layouts.
func TestSessionRoundTrip(t *testing.T) {
	dir := filepath.Join("..", "..", "data", "testscratch", fmt.Sprintf("roundtrip-%d", time.Now().UnixNano()))
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
	var adapter limen.DatabaseAdapter = timeFormatAdapter{sqladapter.NewSQLite(db)}

	now := time.Now().UTC().Truncate(time.Second)
	userRes, err := adapter.Create(ctx, limen.UserSchemaTableName, map[string]any{
		"email":      "roundtrip@example.com",
		"created_at": now,
		"updated_at": now,
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("user insert: %+v", userRes)

	expires := now.Add(24 * time.Hour)
	if _, err := adapter.Create(ctx, limen.SessionSchemaTableName, map[string]any{
		"token":       "tok-roundtrip",
		"user_id":     int64(1),
		"created_at":  now,
		"expires_at":  expires,
		"last_access": now,
	}); err != nil {
		t.Fatal(err)
	}
	row, err := adapter.FindOne(ctx, limen.SessionSchemaTableName, []limen.Where{
		limen.Eq("token", "tok-roundtrip"),
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"created_at", "expires_at", "last_access"} {
		v, ok := row[key].(time.Time)
		if !ok {
			t.Fatalf("%s came back as %T (%v), want time.Time", key, row[key], row[key])
		}
		if v.IsZero() {
			t.Fatalf("%s parsed to zero time", key)
		}
	}
	if got := row["expires_at"].(time.Time); !got.Equal(expires) {
		t.Fatalf("expires_at = %v, want %v", got, expires)
	}
}
