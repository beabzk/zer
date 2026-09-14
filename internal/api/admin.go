package api

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/beabzk/zer/internal/auth"
)

// requireAdmin limits routes to instance admins from ADMIN_EMAILS or the
// instance_admins table.
func (d Deps) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		session, ok := auth.SessionFrom(r.Context())
		userID, err := sessionUserID(session)
		admin := false
		if ok && err == nil {
			admin, err = d.isAdmin(r.Context(), userID, session.User.Email)
		}
		if err != nil {
			writeInternalError(w, r, err)
			return
		}
		if !ok || !admin {
			writeError(w, http.StatusForbidden, "instance admin required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (d Deps) handleAdminStatus(w http.ResponseWriter, r *http.Request) {
	session, ok := auth.SessionFrom(r.Context())
	isAdmin := false
	if ok {
		userID, err := sessionUserID(session)
		if err == nil {
			isAdmin, err = d.isAdmin(r.Context(), userID, session.User.Email)
		}
		if err != nil {
			writeInternalError(w, r, err)
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]bool{"is_admin": isAdmin})
}

func (d Deps) handleAdminListUsers(w http.ResponseWriter, r *http.Request) {
	master, err := d.Manager.Master(r.Context())
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	rows, err := master.QueryContext(r.Context(),
		`SELECT id, email, email_verified_at, first_name, last_name, created_at
		FROM users ORDER BY created_at`)
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	defer rows.Close()
	adminIDs, err := d.instanceAdminIDs(r)
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	users := []map[string]any{}
	for rows.Next() {
		var id int64
		var email, created string
		var verified, first, last sql.NullString
		if err := rows.Scan(&id, &email, &verified, &first, &last, &created); err != nil {
			writeInternalError(w, r, err)
			return
		}
		users = append(users, map[string]any{
			"id": id, "email": email,
			"email_verified_at": nullString(verified),
			"first_name":        nullString(first),
			"last_name":         nullString(last),
			"created_at":        created, "is_admin": d.isAdminEmail(email) || adminIDs[id],
		})
	}
	if err := rows.Err(); err != nil {
		writeInternalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, users)
}

func (d Deps) instanceAdminIDs(r *http.Request) (map[int64]bool, error) {
	master, err := d.Manager.Master(r.Context())
	if err != nil {
		return nil, err
	}
	rows, err := master.QueryContext(r.Context(), `SELECT user_id FROM instance_admins`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[int64]bool)
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = true
	}
	return out, rows.Err()
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
		writeInternalError(w, r, err)
		return
	}
	rows, err := master.QueryContext(r.Context(),
		`SELECT t.id, t.name, t.slug, t.default_lang, t.created_at,
			(SELECT COUNT(*) FROM tree_members m WHERE m.tree_id = t.id) AS members
		FROM trees t ORDER BY t.name`)
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	defer rows.Close()
	trees := []map[string]any{}
	for rows.Next() {
		var id, name, slug, lang, created string
		var members int
		if err := rows.Scan(&id, &name, &slug, &lang, &created, &members); err != nil {
			writeInternalError(w, r, err)
			return
		}
		trees = append(trees, map[string]any{
			"id": id, "name": name, "slug": slug,
			"default_lang": lang, "created_at": created, "members": members,
		})
	}
	if err := rows.Err(); err != nil {
		writeInternalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, trees)
}

func (d Deps) handleAdminDeleteTree(w http.ResponseWriter, r *http.Request) {
	treeID := chi.URLParam(r, "treeID")
	master, err := d.Manager.Master(r.Context())
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	res, err := master.ExecContext(r.Context(), `DELETE FROM trees WHERE id = ?`, treeID)
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeError(w, http.StatusNotFound, "tree not found")
		return
	}
	if err := d.Manager.DropTree(treeID); err != nil {
		writeInternalError(w, r, err)
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
		writeInternalError(w, r, err)
		return
	}
	tx, err := master.Begin()
	if err != nil {
		writeInternalError(w, r, err)
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
			writeInternalError(w, r, err)
			return
		}
	}
	res, err := tx.ExecContext(r.Context(), `DELETE FROM users WHERE id = ?`, target)
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if err := tx.Commit(); err != nil {
		writeInternalError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
