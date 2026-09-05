package api

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/beabzk/zer/internal/auth"
)

// requireAdmin limits routes to instance admins listed in ADMIN_EMAILS.
func (d Deps) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		session, ok := auth.SessionFrom(r.Context())
		if !ok || !d.isAdminEmail(session.User.Email) {
			writeError(w, http.StatusForbidden, "instance admin required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (d Deps) handleAdminStatus(w http.ResponseWriter, r *http.Request) {
	session, ok := auth.SessionFrom(r.Context())
	isAdmin := ok && d.isAdminEmail(session.User.Email)
	writeJSON(w, http.StatusOK, map[string]bool{"is_admin": isAdmin})
}

func (d Deps) handleAdminListUsers(w http.ResponseWriter, r *http.Request) {
	master, err := d.Manager.Master(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "storage unavailable")
		return
	}
	rows, err := master.QueryContext(r.Context(),
		`SELECT id, email, email_verified_at, first_name, last_name, created_at
		FROM users ORDER BY created_at`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "storage unavailable")
		return
	}
	defer rows.Close()
	users := []map[string]any{}
	for rows.Next() {
		var id int64
		var email, created string
		var verified, first, last sql.NullString
		if err := rows.Scan(&id, &email, &verified, &first, &last, &created); err != nil {
			writeError(w, http.StatusInternalServerError, "storage unavailable")
			return
		}
		users = append(users, map[string]any{
			"id": id, "email": email,
			"email_verified_at": nullString(verified),
			"first_name":        nullString(first),
			"last_name":         nullString(last),
			"created_at":        created, "is_admin": d.isAdminEmail(email),
		})
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "storage unavailable")
		return
	}
	writeJSON(w, http.StatusOK, users)
}

func nullString(v sql.NullString) any {
	if !v.Valid {
		return nil
	}
	return v.String
}

func (d Deps) handleAdminListTrees(w http.ResponseWriter, r *http.Request) {
	master, err := d.Manager.Master(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "storage unavailable")
		return
	}
	rows, err := master.QueryContext(r.Context(),
		`SELECT t.id, t.name, t.slug, t.default_lang, t.created_at,
			(SELECT COUNT(*) FROM tree_members m WHERE m.tree_id = t.id) AS members
		FROM trees t ORDER BY t.name`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "storage unavailable")
		return
	}
	defer rows.Close()
	trees := []map[string]any{}
	for rows.Next() {
		var id, name, slug, lang, created string
		var members int
		if err := rows.Scan(&id, &name, &slug, &lang, &created, &members); err != nil {
			writeError(w, http.StatusInternalServerError, "storage unavailable")
			return
		}
		trees = append(trees, map[string]any{
			"id": id, "name": name, "slug": slug,
			"default_lang": lang, "created_at": created, "members": members,
		})
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "storage unavailable")
		return
	}
	writeJSON(w, http.StatusOK, trees)
}

func (d Deps) handleAdminDeleteTree(w http.ResponseWriter, r *http.Request) {
	treeID := chi.URLParam(r, "treeID")
	master, err := d.Manager.Master(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "storage unavailable")
		return
	}
	res, err := master.ExecContext(r.Context(), `DELETE FROM trees WHERE id = ?`, treeID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "storage unavailable")
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeError(w, http.StatusNotFound, "tree not found")
		return
	}
	if err := d.Manager.DropTree(treeID); err != nil {
		writeError(w, http.StatusInternalServerError, "storage unavailable")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleAdminDeleteUser removes a user and everything that references them:
// sessions, OAuth accounts, memberships. Owned trees survive orphaned, with
// created_by cleared, and stay manageable by instance admins. Admins cannot
// delete themselves.
func (d Deps) handleAdminDeleteUser(w http.ResponseWriter, r *http.Request) {
	target, err := strconv.ParseInt(chi.URLParam(r, "userID"), 10, 64)
	if err != nil || target <= 0 {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	session, _ := auth.SessionFrom(r.Context())
	if self, err := sessionUserID(session); err == nil && self == target {
		writeError(w, http.StatusBadRequest, "admins cannot delete themselves")
		return
	}
	master, err := d.Manager.Master(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "storage unavailable")
		return
	}
	tx, err := master.Begin()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "storage unavailable")
		return
	}
	defer tx.Rollback()
	for _, stmt := range []struct {
		query string
		args  []any
	}{
		{`DELETE FROM sessions WHERE user_id = ?`, []any{target}},
		{`DELETE FROM accounts WHERE user_id = ?`, []any{target}},
		{`DELETE FROM tree_members WHERE user_id = ?`, []any{target}},
		{`UPDATE trees SET created_by = NULL WHERE created_by = ?`, []any{target}},
	} {
		if _, err := tx.ExecContext(r.Context(), stmt.query, stmt.args...); err != nil {
			writeError(w, http.StatusInternalServerError, "storage unavailable")
			return
		}
	}
	res, err := tx.ExecContext(r.Context(), `DELETE FROM users WHERE id = ?`, target)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "storage unavailable")
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "storage unavailable")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
