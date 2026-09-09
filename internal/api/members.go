package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

type memberResponse struct {
	TreeID    string `json:"tree_id"`
	UserID    int64  `json:"user_id"`
	Role      string `json:"role"`
	Email     string `json:"email"`
	CreatedAt string `json:"created_at"`
}

func (d Deps) handleListMembers(w http.ResponseWriter, r *http.Request) {
	m := memberFrom(r)
	master, err := d.Manager.Master(r.Context())
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	rows, err := master.QueryContext(r.Context(),
		`SELECT tm.user_id, tm.role, tm.created_at, u.email
		FROM tree_members tm JOIN users u ON u.id = tm.user_id
		WHERE tm.tree_id = ? ORDER BY tm.created_at, u.email`,
		m.TreeID)
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	defer rows.Close()
	members := []memberResponse{}
	for rows.Next() {
		var member memberResponse
		if err := rows.Scan(&member.UserID, &member.Role, &member.CreatedAt,
			&member.Email); err != nil {
			writeInternalError(w, r, err)
			return
		}
		member.TreeID = m.TreeID
		members = append(members, member)
	}
	if err := rows.Err(); err != nil {
		writeInternalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, members)
}

func parseMemberID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	userID, err := strconv.ParseInt(chi.URLParam(r, "userID"), 10, 64)
	if err != nil || userID <= 0 {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return 0, false
	}
	return userID, true
}

func (d Deps) memberWithUser(w http.ResponseWriter, r *http.Request, m Member, userID int64) (memberResponse, bool) {
	master, err := d.Manager.Master(r.Context())
	if err != nil {
		writeInternalError(w, r, err)
		return memberResponse{}, false
	}
	var member memberResponse
	err = master.QueryRowContext(r.Context(),
		`SELECT tm.role, tm.created_at, u.email
		FROM tree_members tm JOIN users u ON u.id = tm.user_id
		WHERE tm.tree_id = ? AND tm.user_id = ?`,
		m.TreeID, userID).Scan(&member.Role, &member.CreatedAt, &member.Email)
	if err == sql.ErrNoRows {
		writeError(w, http.StatusNotFound, "member not found")
		return memberResponse{}, false
	}
	if err != nil {
		writeInternalError(w, r, err)
		return memberResponse{}, false
	}
	member.TreeID = m.TreeID
	member.UserID = userID
	return member, true
}

func (d Deps) handleUpdateMember(w http.ResponseWriter, r *http.Request) {
	m := memberFrom(r)
	userID, ok := parseMemberID(w, r)
	if !ok {
		return
	}
	var body struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if _, valid := roleRank[body.Role]; !valid {
		writeError(w, http.StatusBadRequest, "unknown role")
		return
	}
	if !m.Admin && body.Role == RoleOwner {
		writeError(w, http.StatusForbidden, "only instance admins can grant the owner role")
		return
	}
	current, ok := d.memberWithUser(w, r, m, userID)
	if !ok {
		return
	}
	if !m.Admin && m.Role != RoleOwner && current.Role == RoleOwner {
		writeError(w, http.StatusForbidden, "only an owner can change an owner membership")
		return
	}
	if !m.Admin && m.Role != RoleOwner && roleRank[current.Role] >= roleRank[m.Role] {
		writeError(w, http.StatusForbidden, "cannot change a member at or above your role")
		return
	}
	if !m.Admin && current.Role == RoleOwner {
		master, err := d.Manager.Master(r.Context())
		if err != nil {
			writeInternalError(w, r, err)
			return
		}
		var owners int
		if err := master.QueryRowContext(r.Context(),
			`SELECT COUNT(*) FROM tree_members WHERE tree_id = ? AND role = ?`,
			m.TreeID, RoleOwner).Scan(&owners); err != nil {
			writeInternalError(w, r, err)
			return
		}
		if owners <= 1 {
			writeError(w, http.StatusConflict, "at least one owner is required")
			return
		}
	}
	master, err := d.Manager.Master(r.Context())
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	if _, err := master.ExecContext(r.Context(),
		`UPDATE tree_members SET role = ? WHERE tree_id = ? AND user_id = ?`,
		body.Role, m.TreeID, userID); err != nil {
		writeInternalError(w, r, err)
		return
	}
	updated, ok := d.memberWithUser(w, r, m, userID)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (d Deps) handleRemoveMember(w http.ResponseWriter, r *http.Request) {
	m := memberFrom(r)
	userID, ok := parseMemberID(w, r)
	if !ok {
		return
	}
	current, ok := d.memberWithUser(w, r, m, userID)
	if !ok {
		return
	}
	if !m.Admin && m.Role != RoleOwner && current.Role == RoleOwner {
		writeError(w, http.StatusForbidden, "only an owner can remove an owner membership")
		return
	}
	if !m.Admin && m.Role != RoleOwner && roleRank[current.Role] >= roleRank[m.Role] {
		writeError(w, http.StatusForbidden, "cannot remove a member at or above your role")
		return
	}
	if !m.Admin && current.Role == RoleOwner {
		master, err := d.Manager.Master(r.Context())
		if err != nil {
			writeInternalError(w, r, err)
			return
		}
		var owners int
		if err := master.QueryRowContext(r.Context(),
			`SELECT COUNT(*) FROM tree_members WHERE tree_id = ? AND role = ?`,
			m.TreeID, RoleOwner).Scan(&owners); err != nil {
			writeInternalError(w, r, err)
			return
		}
		if owners <= 1 {
			writeError(w, http.StatusConflict, "at least one owner is required")
			return
		}
	}
	master, err := d.Manager.Master(r.Context())
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	if _, err := master.ExecContext(r.Context(),
		`DELETE FROM tree_members WHERE tree_id = ? AND user_id = ?`,
		m.TreeID, userID); err != nil {
		writeInternalError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
