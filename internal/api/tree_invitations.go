package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/beabzk/zer/internal/auth"
)

type treeInvitationResponse struct {
	ID         string  `json:"id"`
	TreeID     string  `json:"tree_id"`
	Email      string  `json:"email"`
	Role       string  `json:"role"`
	Status     string  `json:"status"`
	ExpiresAt  string  `json:"expires_at"`
	CreatedAt  string  `json:"created_at"`
	AcceptedAt *string `json:"accepted_at"`
	RevokedAt  *string `json:"revoked_at"`
	InviteURL  string  `json:"invite_url,omitempty"`
}

type createTreeInvitationBody struct {
	Email          string `json:"email"`
	Role           string `json:"role"`
	ExpiresInHours int    `json:"expiresInHours"`
}

type treeInvitationTokenBody struct {
	Token string `json:"token"`
}

type treeInvitationRecord struct {
	ID         string
	TreeID     string
	TreeName   string
	UserID     int64
	Email      string
	Role       string
	ExpiresAt  string
	CreatedAt  string
	AcceptedAt *string
	RevokedAt  *string
}

func (d Deps) handleCreateTreeInvitation(w http.ResponseWriter, r *http.Request) {
	m := memberFrom(r)
	var body createTreeInvitationBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	body.Email = strings.ToLower(strings.TrimSpace(body.Email))
	if !signupEmailPattern.MatchString(body.Email) {
		writeError(w, http.StatusBadRequest, "invalid email")
		return
	}
	rank, valid := roleRank[body.Role]
	if !valid || body.Role == RoleOwner {
		writeError(w, http.StatusBadRequest, "invalid invitation role")
		return
	}
	if !m.Admin && m.Role != RoleOwner && rank >= roleRank[m.Role] {
		writeError(w, http.StatusForbidden, "cannot invite a role at or above your own")
		return
	}

	master, err := d.Manager.Master(r.Context())
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	var targetID int64
	err = master.QueryRowContext(r.Context(),
		`SELECT id FROM users WHERE lower(email) = ? LIMIT 1`, body.Email).Scan(&targetID)
	if err == sql.ErrNoRows {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	var memberCount int
	if err := master.QueryRowContext(r.Context(),
		`SELECT COUNT(*) FROM tree_members WHERE tree_id = ? AND user_id = ?`,
		m.TreeID, targetID).Scan(&memberCount); err != nil {
		writeInternalError(w, r, err)
		return
	}
	if memberCount != 0 {
		writeError(w, http.StatusConflict, "user is already a member")
		return
	}

	expiry := body.ExpiresInHours
	if expiry == 0 {
		expiry = 168
	}
	if expiry < 1 || expiry > 720 {
		writeError(w, http.StatusBadRequest, "invitation expiry must be between 1 and 720 hours")
		return
	}
	token, err := randomInviteToken()
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	now := time.Now().UTC()
	response := treeInvitationResponse{
		ID:        uuid.NewString(),
		TreeID:    m.TreeID,
		Email:     body.Email,
		Role:      body.Role,
		Status:    "PENDING",
		ExpiresAt: now.Add(time.Duration(expiry) * time.Hour).Format(time.RFC3339),
		CreatedAt: now.Format(time.RFC3339),
		InviteURL: strings.TrimRight(d.BaseURL, "/") + "/tree-invite#invite=" + token,
	}
	_, err = master.ExecContext(r.Context(),
		`INSERT INTO tree_invitations (
			id, tree_id, user_id, email, role, token_hash, invited_by,
			expires_at, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		response.ID, m.TreeID, targetID, body.Email, body.Role,
		inviteTokenHash(token), m.UserID, response.ExpiresAt, response.CreatedAt)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			writeError(w, http.StatusConflict, "an active invitation already exists for this user")
			return
		}
		writeInternalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, response)
}

func (d Deps) handleListTreeInvitations(w http.ResponseWriter, r *http.Request) {
	m := memberFrom(r)
	master, err := d.Manager.Master(r.Context())
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	rows, err := master.QueryContext(r.Context(),
		`SELECT id, tree_id, email, role, expires_at, created_at, accepted_at, revoked_at
		FROM tree_invitations WHERE tree_id = ? ORDER BY created_at DESC`, m.TreeID)
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	defer rows.Close()
	invitations := []treeInvitationResponse{}
	now := time.Now().UTC()
	for rows.Next() {
		invitation := treeInvitationResponse{TreeID: m.TreeID}
		if err := rows.Scan(&invitation.ID, &invitation.TreeID, &invitation.Email,
			&invitation.Role, &invitation.ExpiresAt, &invitation.CreatedAt,
			&invitation.AcceptedAt, &invitation.RevokedAt); err != nil {
			writeInternalError(w, r, err)
			return
		}
		invitation.Status = treeInvitationStatus(invitation, now)
		invitations = append(invitations, invitation)
	}
	if err := rows.Err(); err != nil {
		writeInternalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, invitations)
}

func (d Deps) handleRevokeTreeInvitation(w http.ResponseWriter, r *http.Request) {
	m := memberFrom(r)
	invitationID := chi.URLParam(r, "invitationID")
	master, err := d.Manager.Master(r.Context())
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	var acceptedAt, revokedAt *string
	err = master.QueryRowContext(r.Context(),
		`SELECT accepted_at, revoked_at FROM tree_invitations
		WHERE id = ? AND tree_id = ?`, invitationID, m.TreeID).Scan(&acceptedAt, &revokedAt)
	if err == sql.ErrNoRows {
		writeError(w, http.StatusNotFound, "invitation not found")
		return
	}
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	if acceptedAt != nil || revokedAt != nil {
		writeError(w, http.StatusConflict, "invitation is already finalized")
		return
	}
	result, err := master.ExecContext(r.Context(),
		`UPDATE tree_invitations SET revoked_at = ?
		WHERE id = ? AND tree_id = ? AND accepted_at IS NULL AND revoked_at IS NULL`,
		time.Now().UTC().Format(time.RFC3339), invitationID, m.TreeID)
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	updated, err := result.RowsAffected()
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	if updated != 1 {
		writeError(w, http.StatusConflict, "invitation is already finalized")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (d Deps) treeInvitationForToken(w http.ResponseWriter, r *http.Request, token string) (treeInvitationRecord, bool) {
	master, err := d.Manager.Master(r.Context())
	if err != nil {
		writeInternalError(w, r, err)
		return treeInvitationRecord{}, false
	}
	var invitation treeInvitationRecord
	err = master.QueryRowContext(r.Context(),
		`SELECT i.id, i.tree_id, t.name, i.user_id, i.email, i.role,
			i.expires_at, i.created_at, i.accepted_at, i.revoked_at
		FROM tree_invitations i JOIN trees t ON t.id = i.tree_id
		WHERE i.token_hash = ?`, inviteTokenHash(token)).
		Scan(&invitation.ID, &invitation.TreeID, &invitation.TreeName, &invitation.UserID,
			&invitation.Email, &invitation.Role, &invitation.ExpiresAt,
			&invitation.CreatedAt, &invitation.AcceptedAt, &invitation.RevokedAt)
	if err == sql.ErrNoRows {
		writeError(w, http.StatusForbidden, "invalid invitation")
		return treeInvitationRecord{}, false
	}
	if err != nil {
		writeInternalError(w, r, err)
		return treeInvitationRecord{}, false
	}
	if invitation.AcceptedAt != nil || invitation.RevokedAt != nil || inviteExpired(invitation.ExpiresAt, time.Now().UTC()) {
		writeError(w, http.StatusForbidden, "invalid invitation")
		return treeInvitationRecord{}, false
	}
	return invitation, true
}

func (d Deps) handleValidateTreeInvitation(w http.ResponseWriter, r *http.Request) {
	invitation, ok := d.treeInvitationForRequest(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"email":      invitation.Email,
		"tree_id":    invitation.TreeID,
		"tree_name":  invitation.TreeName,
		"role":       invitation.Role,
		"expires_at": invitation.ExpiresAt,
	})
}

func (d Deps) handleAcceptTreeInvitation(w http.ResponseWriter, r *http.Request) {
	invitation, ok := d.treeInvitationForRequest(w, r)
	if !ok {
		return
	}
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
	if _, err := tx.ExecContext(r.Context(),
		`INSERT INTO tree_members (id, tree_id, user_id, role) VALUES (?, ?, ?, ?)`,
		uuid.NewString(), invitation.TreeID, invitation.UserID, invitation.Role); err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			writeError(w, http.StatusConflict, "user is already a member")
			return
		}
		writeInternalError(w, r, err)
		return
	}
	result, err := tx.ExecContext(r.Context(),
		`UPDATE tree_invitations SET accepted_at = ?, accepted_by = ?
		WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL`,
		time.Now().UTC().Format(time.RFC3339), userID, invitation.ID)
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	updated, err := result.RowsAffected()
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	if updated != 1 {
		writeError(w, http.StatusConflict, "invitation is no longer available")
		return
	}
	if err := tx.Commit(); err != nil {
		writeInternalError(w, r, err)
		return
	}

	member := Member{TreeID: invitation.TreeID, UserID: invitation.UserID, Role: invitation.Role}
	response, ok := d.memberWithUser(w, r, member, invitation.UserID)
	if !ok {
		return
	}
	writeJSON(w, http.StatusCreated, response)
}

func (d Deps) treeInvitationForRequest(w http.ResponseWriter, r *http.Request) (treeInvitationRecord, bool) {
	var body treeInvitationTokenBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return treeInvitationRecord{}, false
	}
	invitation, ok := d.treeInvitationForToken(w, r, body.Token)
	if !ok {
		return treeInvitationRecord{}, false
	}
	session, ok := auth.SessionFrom(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return treeInvitationRecord{}, false
	}
	userID, err := sessionUserID(session)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return treeInvitationRecord{}, false
	}
	if userID != invitation.UserID || strings.ToLower(strings.TrimSpace(session.User.Email)) != invitation.Email {
		writeError(w, http.StatusForbidden, "invitation is for another account")
		return treeInvitationRecord{}, false
	}
	return invitation, true
}

func treeInvitationStatus(invitation treeInvitationResponse, now time.Time) string {
	switch {
	case invitation.AcceptedAt != nil:
		return "ACCEPTED"
	case invitation.RevokedAt != nil:
		return "REVOKED"
	case inviteExpired(invitation.ExpiresAt, now):
		return "EXPIRED"
	default:
		return "PENDING"
	}
}
