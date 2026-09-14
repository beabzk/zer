package api

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/beabzk/zer/internal/auth"
)

type authConfigResponse struct {
	SetupRequired   bool    `json:"setup_required"`
	SignupMode      *string `json:"signup_mode"`
	PasswordEnabled bool    `json:"password_enabled"`
	GoogleEnabled   bool    `json:"google_enabled"`
}

type signupSettingsResponse struct {
	SignupMode               string `json:"signup_mode"`
	DefaultInviteExpiryHours int    `json:"default_invite_expiry_hours"`
}

type signupSettingsBody struct {
	SignupMode               string `json:"signupMode"`
	DefaultInviteExpiryHours int    `json:"defaultInviteExpiryHours"`
}

type inviteResponse struct {
	ID         string  `json:"id"`
	Email      string  `json:"email"`
	Status     string  `json:"status"`
	ExpiresAt  string  `json:"expires_at"`
	CreatedAt  string  `json:"created_at"`
	AcceptedAt *string `json:"accepted_at"`
	RevokedAt  *string `json:"revoked_at"`
	InviteURL  string  `json:"invite_url,omitempty"`
}

type createInviteBody struct {
	Email          string `json:"email"`
	ExpiresInHours int    `json:"expiresInHours"`
}

type validateInviteBody struct {
	Token string `json:"token"`
}

func (d Deps) handleAuthConfig(w http.ResponseWriter, r *http.Request) {
	master, err := d.Manager.Master(r.Context())
	if err != nil {
		writeInternalError(w, r, err)
		return
	}

	var mode string
	err = master.QueryRowContext(r.Context(),
		`SELECT signup_mode FROM instance_settings WHERE id = 1`).Scan(&mode)
	configured := err == nil
	if err != nil && err != sql.ErrNoRows {
		writeInternalError(w, r, err)
		return
	}

	setupRequired := !configured
	if setupRequired {
		var users int
		if err := master.QueryRowContext(r.Context(),
			`SELECT COUNT(*) FROM users`).Scan(&users); err != nil {
			writeInternalError(w, r, err)
			return
		}
		if users > 0 {
			fallback := "INVITE"
			mode = fallback
			configured = true
			setupRequired = false
		}
	}

	response := authConfigResponse{
		SetupRequired:   setupRequired,
		PasswordEnabled: d.PasswordEnabled,
		GoogleEnabled:   d.GoogleEnabled,
	}
	if configured {
		response.SignupMode = &mode
	}
	writeJSON(w, http.StatusOK, response)
}

func (d Deps) handleGetSignupSettings(w http.ResponseWriter, r *http.Request) {
	master, err := d.Manager.Master(r.Context())
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	response := signupSettingsResponse{SignupMode: "INVITE", DefaultInviteExpiryHours: 168}
	err = master.QueryRowContext(r.Context(),
		`SELECT signup_mode, default_invite_expiry_hours
		FROM instance_settings WHERE id = 1`).Scan(&response.SignupMode, &response.DefaultInviteExpiryHours)
	if err != nil && err != sql.ErrNoRows {
		writeInternalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func (d Deps) handleUpdateSignupSettings(w http.ResponseWriter, r *http.Request) {
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

	var body signupSettingsBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	body.SignupMode = strings.ToUpper(strings.TrimSpace(body.SignupMode))
	if body.SignupMode != "OPEN" && body.SignupMode != "INVITE" && body.SignupMode != "CLOSED" {
		writeError(w, http.StatusBadRequest, "invalid signup mode")
		return
	}
	if body.DefaultInviteExpiryHours < 1 || body.DefaultInviteExpiryHours > 720 {
		writeError(w, http.StatusBadRequest, "default invite expiry must be between 1 and 720 hours")
		return
	}

	master, err := d.Manager.Master(r.Context())
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	_, err = master.ExecContext(r.Context(),
		`INSERT INTO instance_settings (
			id, signup_mode, default_invite_expiry_hours, setup_completed_at, updated_at, updated_by
		) VALUES (1, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
			strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), ?)
		ON CONFLICT(id) DO UPDATE SET
			signup_mode = excluded.signup_mode,
			default_invite_expiry_hours = excluded.default_invite_expiry_hours,
			updated_at = excluded.updated_at,
			updated_by = excluded.updated_by`,
		body.SignupMode, body.DefaultInviteExpiryHours, userID)
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, signupSettingsResponse{
		SignupMode:               body.SignupMode,
		DefaultInviteExpiryHours: body.DefaultInviteExpiryHours,
	})
}

func (d Deps) handleCreateInvite(w http.ResponseWriter, r *http.Request) {
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
	var body createInviteBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	body.Email = strings.ToLower(strings.TrimSpace(body.Email))
	if _, err := mail.ParseAddress(body.Email); err != nil {
		writeError(w, http.StatusBadRequest, "invalid email")
		return
	}

	master, err := d.Manager.Master(r.Context())
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	expiry := body.ExpiresInHours
	if expiry == 0 {
		err = master.QueryRowContext(r.Context(),
			`SELECT default_invite_expiry_hours FROM instance_settings WHERE id = 1`).Scan(&expiry)
		if err == sql.ErrNoRows {
			expiry = 168
		} else if err != nil {
			writeInternalError(w, r, err)
			return
		}
	}
	if expiry < 1 || expiry > 720 {
		writeError(w, http.StatusBadRequest, "invite expiry must be between 1 and 720 hours")
		return
	}

	token, err := randomInviteToken()
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	now := time.Now().UTC()
	response := inviteResponse{
		ID:        uuid.NewString(),
		Email:     body.Email,
		Status:    "PENDING",
		ExpiresAt: now.Add(time.Duration(expiry) * time.Hour).Format(time.RFC3339),
		CreatedAt: now.Format(time.RFC3339),
		InviteURL: strings.TrimRight(d.BaseURL, "/") + "/signup#invite=" + token,
	}
	_, err = master.ExecContext(r.Context(),
		`INSERT INTO signup_invites (
			id, email, token_hash, invited_by, expires_at, created_at
		) VALUES (?, ?, ?, ?, ?, ?)`,
		response.ID, response.Email, inviteTokenHash(token), userID,
		response.ExpiresAt, response.CreatedAt)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			writeError(w, http.StatusConflict, "an active invite already exists for this email")
			return
		}
		writeInternalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, response)
}

func (d Deps) handleListInvites(w http.ResponseWriter, r *http.Request) {
	master, err := d.Manager.Master(r.Context())
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	rows, err := master.QueryContext(r.Context(),
		`SELECT id, email, expires_at, created_at, accepted_at, revoked_at
		FROM signup_invites ORDER BY created_at DESC`)
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	defer rows.Close()
	invites := []inviteResponse{}
	for rows.Next() {
		var invite inviteResponse
		if err := rows.Scan(&invite.ID, &invite.Email, &invite.ExpiresAt,
			&invite.CreatedAt, &invite.AcceptedAt, &invite.RevokedAt); err != nil {
			writeInternalError(w, r, err)
			return
		}
		invite.Status = inviteStatus(invite, time.Now().UTC())
		invites = append(invites, invite)
	}
	if err := rows.Err(); err != nil {
		writeInternalError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, invites)
}

func (d Deps) handleRevokeInvite(w http.ResponseWriter, r *http.Request) {
	inviteID := chi.URLParam(r, "inviteID")
	master, err := d.Manager.Master(r.Context())
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	res, err := master.ExecContext(r.Context(),
		`UPDATE signup_invites SET revoked_at = ?
		WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL`,
		time.Now().UTC().Format(time.RFC3339), inviteID)
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	count, _ := res.RowsAffected()
	if count == 1 {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	var exists int
	if err := master.QueryRowContext(r.Context(),
		`SELECT COUNT(*) FROM signup_invites WHERE id = ?`, inviteID).Scan(&exists); err != nil {
		writeInternalError(w, r, err)
		return
	}
	if exists == 0 {
		writeError(w, http.StatusNotFound, "invite not found")
		return
	}
	writeError(w, http.StatusConflict, "invite is already finalized")
}

func (d Deps) handleValidateInvite(w http.ResponseWriter, r *http.Request) {
	var body validateInviteBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	master, err := d.Manager.Master(r.Context())
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	var invite inviteResponse
	err = master.QueryRowContext(r.Context(),
		`SELECT id, email, expires_at, created_at, accepted_at, revoked_at
		FROM signup_invites WHERE token_hash = ?`, inviteTokenHash(body.Token)).
		Scan(&invite.ID, &invite.Email, &invite.ExpiresAt, &invite.CreatedAt,
			&invite.AcceptedAt, &invite.RevokedAt)
	if err != nil || inviteStatus(invite, time.Now().UTC()) != "PENDING" {
		writeError(w, http.StatusForbidden, "invalid invite")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"email":      invite.Email,
		"expires_at": invite.ExpiresAt,
	})
}

func randomInviteToken() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func inviteTokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func inviteStatus(invite inviteResponse, now time.Time) string {
	switch {
	case invite.AcceptedAt != nil:
		return "ACCEPTED"
	case invite.RevokedAt != nil:
		return "REVOKED"
	case inviteExpired(invite.ExpiresAt, now):
		return "EXPIRED"
	default:
		return "PENDING"
	}
}

func inviteExpired(value string, now time.Time) bool {
	expiresAt, err := time.Parse(time.RFC3339, value)
	return err != nil || !now.Before(expiresAt)
}
