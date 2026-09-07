// Package api serves the /api/v1 JSON endpoints. Every route except health
// requires a Limen session, and every tree route requires membership in
// that tree with a sufficient role.
package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/thecodearcher/limen"

	"github.com/beabzk/zer/internal/auth"
	"github.com/beabzk/zer/internal/database"
)

// Roles in ascending privilege.
const (
	RoleViewer = "VIEWER"
	RoleEditor = "EDITOR"
	RoleAdmin  = "ADMIN"
	RoleOwner  = "OWNER"
)

var roleRank = map[string]int{
	RoleViewer: 1,
	RoleEditor: 2,
	RoleAdmin:  3,
	RoleOwner:  4,
}

// Deps carries shared resources for handlers.
type Deps struct {
	Manager *database.Manager
	Engine  *limen.Limen
	// AdminEmails holds lowercased instance admin emails from ADMIN_EMAILS.
	AdminEmails map[string]bool
}

// ParseAdminEmails splits a comma-separated env value into a lookup set.
func ParseAdminEmails(raw string) map[string]bool {
	out := make(map[string]bool)
	for _, part := range strings.Split(raw, ",") {
		if email := strings.ToLower(strings.TrimSpace(part)); email != "" {
			out[email] = true
		}
	}
	return out
}

func (d Deps) isAdminEmail(email string) bool {
	return d.AdminEmails[strings.ToLower(strings.TrimSpace(email))]
}

type memberKey struct{}

// Member holds the resolved tree membership for a request.
type Member struct {
	TreeID string
	UserID int64
	Role   string
	// Admin marks instance admins, who bypass membership checks.
	Admin bool
}

// Mount registers /api/v1 routes on r. Tests use mount with a stub session
// middleware to bypass Limen cookie checks.
func Mount(r chi.Router, d Deps) {
	mount(r, d, auth.RequireSession(d.Engine))
}

func mount(r chi.Router, d Deps, sessionMW func(http.Handler) http.Handler) {
	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/health", handleHealth)
		r.Group(func(r chi.Router) {
			r.Use(sessionMW)
			r.Post("/trees", d.handleCreateTree)
			r.Get("/trees", d.handleListTrees)
			r.Route("/admin", func(r chi.Router) {
				r.Use(d.requireAdmin)
				r.Get("/status", d.handleAdminStatus)
				r.Get("/users", d.handleAdminListUsers)
				r.Get("/trees", d.handleAdminListTrees)
				r.Delete("/trees/{treeID}", d.handleAdminDeleteTree)
				r.Delete("/users/{userID}", d.handleAdminDeleteUser)
			})
			r.Route("/trees/{treeID}", func(r chi.Router) {
				r.Use(d.requireMember(RoleViewer))
				r.Get("/stats", d.handleTreeStats)
				r.Get("/overview", d.handleTreeOverview)
				r.With(d.requireMember(RoleAdmin)).Post("/members", d.handleAddMember)
				r.With(d.requireMember(RoleEditor)).Post("/individuals", d.handleCreateIndividual)
				r.Get("/individuals", d.handleListIndividuals)
				r.Get("/individuals/{id}", d.handleGetIndividual)
				r.Get("/individuals/{id}/detail", d.handleGetIndividualDetail)
				r.With(d.requireMember(RoleEditor)).Put("/individuals/{id}", d.handleUpdateIndividual)
				r.With(d.requireMember(RoleEditor)).Delete("/individuals/{id}", d.handleDeleteIndividual)
				r.With(d.requireMember(RoleEditor)).Post("/relationships/parent-child", d.handleAddParentChild)
				r.With(d.requireMember(RoleEditor)).Put("/relationships/parent-child", d.handleUpdateParentChild)
				r.With(d.requireMember(RoleEditor)).Post("/relationships/union", d.handleAddUnion)
				r.Get("/analysis/kinship", d.handleKinship)
				r.Get("/analysis/lineage/{id}", d.handleLineage)
				r.Get("/graph/subgraph", d.handleSubgraph)
			})
		})
	})
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// requireMember loads the caller's membership for the URL tree and rejects
// the request below the minimum role.
func (d Deps) requireMember(minRole string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			session, ok := auth.SessionFrom(r.Context())
			if !ok {
				writeError(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			userID, err := sessionUserID(session)
			if err != nil {
				writeError(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			treeID := chi.URLParam(r, "treeID")
			master, err := d.Manager.Master(r.Context())
			if err != nil {
				writeInternalError(w, r, err)
				return
			}
			var role string
			member := Member{TreeID: treeID, UserID: userID}
			err = master.QueryRowContext(r.Context(),
				`SELECT role FROM tree_members WHERE tree_id = ? AND user_id = ?`,
				treeID, userID).Scan(&role)
			switch {
			case err == nil:
				member.Role = role
			case err == sql.ErrNoRows && d.isAdminEmail(session.User.Email):
				member.Admin = true
				member.Role = RoleOwner
			case err == sql.ErrNoRows:
				writeError(w, http.StatusForbidden, "not a member of this tree")
				return
			default:
				writeInternalError(w, r, err)
				return
			}
			if roleRank[member.Role] < roleRank[minRole] {
				writeError(w, http.StatusForbidden, "insufficient role")
				return
			}
			ctx := context.WithValue(r.Context(), memberKey{}, member)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func memberFrom(r *http.Request) Member {
	m, _ := r.Context().Value(memberKey{}).(Member)
	return m
}

func treeDB(w http.ResponseWriter, r *http.Request, d Deps) (*sql.DB, Member, bool) {
	m := memberFrom(r)
	db, err := d.Manager.Tree(r.Context(), m.TreeID)
	if err != nil {
		writeInternalError(w, r, err)
		return nil, m, false
	}
	return db, m, true
}

func sessionUserID(session *limen.ValidatedSession) (int64, error) {
	if session == nil || session.User == nil {
		return 0, fmt.Errorf("no session user")
	}
	switch id := session.User.ID.(type) {
	case int64:
		return id, nil
	case int:
		return int64(id), nil
	case float64:
		return int64(id), nil
	default:
		return 0, fmt.Errorf("unsupported user id type %T", session.User.ID)
	}
}

func queryDepth(r *http.Request, fallback int) int {
	raw := r.URL.Query().Get("depth")
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

// writeInternalError reports a generic failure to the client while logging
// the cause with the request path server-side.
func writeInternalError(w http.ResponseWriter, r *http.Request, err error) {
	log.Printf("%s %s: %v", r.Method, r.URL.Path, err)
	writeError(w, http.StatusInternalServerError, "internal server error")
}
