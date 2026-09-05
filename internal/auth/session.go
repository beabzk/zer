package auth

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/thecodearcher/limen"
)

type sessionKey struct{}

// RequireSession rejects requests without a valid Limen session and stores
// the validated session in the request context for handlers.
func RequireSession(engine *limen.Limen) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			session, err := engine.GetSession(r)
			if err != nil || session == nil {
				writeAuthError(w)
				return
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), sessionKey{}, session)))
		})
	}
}

// SessionFrom returns the validated session stored by RequireSession.
func SessionFrom(ctx context.Context) (*limen.ValidatedSession, bool) {
	session, ok := ctx.Value(sessionKey{}).(*limen.ValidatedSession)
	return session, ok && session != nil
}

func writeAuthError(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
}
