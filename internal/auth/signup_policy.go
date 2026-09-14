package auth

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/thecodearcher/limen"
)

const (
	SignupModeOpen   = "OPEN"
	SignupModeInvite = "INVITE"
	SignupModeClosed = "CLOSED"

	oauthInviteCookieName = "zer_invite"
	oauthSetupCookieName  = "zer_setup_mode"
)

// SignupPolicyOptions carries operator settings that cannot be derived from
// the master database.
type SignupPolicyOptions struct {
	AdminEmails map[string]bool
}

type signupPolicy struct {
	db               *sql.DB
	adminEmails      map[string]bool
	allowDirectSetup bool
	secureCookies    bool

	oauthUserBounds sync.Map
}

type oauthInviteClaim struct {
	ID          string
	Email       string
	UserID      int64
	CreatedUser bool
}

type oauthCallbackState struct {
	maxUserID int64
	claim     *oauthInviteClaim
	setupMode string
}

func newSignupPolicy(db *sql.DB, baseURL string, options SignupPolicyOptions) *signupPolicy {
	return &signupPolicy{
		db:               db,
		adminEmails:      options.AdminEmails,
		allowDirectSetup: isLocalBaseURL(baseURL),
		secureCookies:    isSecureBaseURL(baseURL),
	}
}

func (p *signupPolicy) Name() limen.PluginName {
	return "zer-signup-policy"
}

func (p *signupPolicy) Initialize(_ *limen.LimenCore) error {
	return nil
}

func (p *signupPolicy) PluginHTTPConfig() limen.PluginHTTPConfig {
	return limen.PluginHTTPConfig{
		BasePath: "/",
		Hooks: &limen.Hooks{
			Before: []*limen.Hook{
				{PathMatcher: isCredentialSignup, Run: p.beforeCredentialSignup},
				{PathMatcher: isOAuthAuthorize, Run: p.beforeOAuthAuthorize},
				{PathMatcher: isOAuthCallback, Run: p.beforeOAuthCallback},
			},
			After: []*limen.Hook{
				{PathMatcher: isCredentialSignup, Run: p.afterCredentialSignup},
				{PathMatcher: isOAuthCallback, Run: p.afterOAuthCallback},
			},
		},
	}
}

func (p *signupPolicy) RegisterRoutes(_ *limen.LimenHTTPCore, _ *limen.RouteBuilder) {}

func isCredentialSignup(ctx *limen.HookContext) bool {
	return ctx.Method() == http.MethodPost && ctx.Path() == "/auth/signup/credential"
}

func isOAuthCallback(ctx *limen.HookContext) bool {
	return ctx.Method() == http.MethodGet && strings.HasSuffix(ctx.Path(), "/callback")
}

func isOAuthAuthorize(ctx *limen.HookContext) bool {
	return ctx.Method() == http.MethodGet && strings.HasSuffix(ctx.Path(), "/authorize")
}

func (p *signupPolicy) beforeCredentialSignup(ctx *limen.HookContext) bool {
	mode, configured, err := p.signupMode()
	if err != nil {
		p.writeInternalError(ctx, err)
		return false
	}
	if !configured {
		userCount, err := p.userCount()
		if err != nil {
			p.writeInternalError(ctx, err)
			return false
		}
		if userCount == 0 {
			return p.authorizeFirstUser(ctx)
		}
		mode = SignupModeInvite
	}

	switch mode {
	case SignupModeOpen:
		return true
	case SignupModeInvite:
		return p.authorizeInvite(ctx)
	case SignupModeClosed:
		p.writeSignupForbidden(ctx)
		return false
	default:
		p.writeInternalError(ctx, fmt.Errorf("unknown signup mode %q", mode))
		return false
	}
}

func (p *signupPolicy) afterCredentialSignup(ctx *limen.HookContext) bool {
	token := strings.TrimSpace(fmt.Sprint(additionalFields(ctx)["inviteToken"]))
	result := ctx.GetAuthResult()
	if result == nil || result.User == nil {
		p.releaseInvite(token)
		return true
	}
	configured, err := p.settingsExist()
	if err != nil {
		p.writeInternalError(ctx, err)
		return false
	}
	if configured {
		mode, err := p.signupModeValue()
		if err != nil {
			p.writeInternalError(ctx, err)
			return false
		}
		if mode != SignupModeInvite {
			return true
		}
		userID, ok := limenUserID(result.User.ID)
		if !ok {
			p.releaseInvite(token)
			p.writeInternalError(ctx, fmt.Errorf("invalid user id %v", result.User.ID))
			return false
		}
		if err := p.acceptInvite(token, userID); err != nil {
			p.removeUnauthorizedUser(ctx, userID)
			p.releaseInvite(token)
			p.writeInternalError(ctx, err)
			return false
		}
		return true
	}
	mode := signupModeFromBody(ctx)
	if mode == "" {
		mode = SignupModeInvite
	}
	userID, ok := limenUserID(result.User.ID)
	if !ok {
		p.writeInternalError(ctx, fmt.Errorf("invalid user id %v", result.User.ID))
		return false
	}
	if err := p.completeSetup(mode, userID); err != nil {
		p.removeUnauthorizedUser(ctx, userID)
		p.writeInternalError(ctx, err)
		return false
	}
	return true
}

func (p *signupPolicy) authorizeInvite(ctx *limen.HookContext) bool {
	fields := additionalFields(ctx)
	token := strings.TrimSpace(fmt.Sprint(fields["inviteToken"]))
	email := strings.ToLower(strings.TrimSpace(fmt.Sprint(ctx.GetJSONBodyValue("email"))))
	if token == "" || email == "" {
		p.writeSignupForbidden(ctx)
		return false
	}

	var id, invitedEmail, expiresAt string
	var acceptedAt, revokedAt, reservedAt sql.NullString
	err := p.db.QueryRow(`
		SELECT id, email, expires_at, accepted_at, revoked_at, reserved_at
		FROM signup_invites WHERE token_hash = ?`, inviteTokenHash(token)).
		Scan(&id, &invitedEmail, &expiresAt, &acceptedAt, &revokedAt, &reservedAt)
	if err != nil || acceptedAt.Valid || revokedAt.Valid || inviteExpired(expiresAt) {
		p.writeSignupForbidden(ctx)
		return false
	}
	if strings.ToLower(strings.TrimSpace(invitedEmail)) != email {
		p.writeSignupForbidden(ctx)
		return false
	}

	now := time.Now().UTC()
	reservationCutoff := now.Add(-10 * time.Minute).Format(time.RFC3339)
	res, err := p.db.Exec(`
		UPDATE signup_invites SET reserved_at = ?
		WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL
		  AND expires_at > ? AND (reserved_at IS NULL OR reserved_at < ?)`,
		now.Format(time.RFC3339), id, now.Format(time.RFC3339), reservationCutoff)
	if err != nil {
		p.writeInternalError(ctx, err)
		return false
	}
	count, _ := res.RowsAffected()
	if count != 1 {
		p.writeSignupForbidden(ctx)
		return false
	}
	return true
}

func (p *signupPolicy) acceptInvite(token string, userID int64) error {
	res, err := p.db.Exec(`
		UPDATE signup_invites
		SET accepted_at = ?, accepted_by = ?, reserved_at = NULL
		WHERE token_hash = ? AND accepted_at IS NULL AND revoked_at IS NULL
		  AND expires_at > ?`,
		time.Now().UTC().Format(time.RFC3339), userID, inviteTokenHash(token),
		time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		return err
	}
	count, _ := res.RowsAffected()
	if count != 1 {
		return fmt.Errorf("invite reservation was not accepted")
	}
	return nil
}

func (p *signupPolicy) releaseInvite(token string) {
	if token == "" {
		return
	}
	_, _ = p.db.Exec(`
		UPDATE signup_invites SET reserved_at = NULL
		WHERE token_hash = ? AND accepted_at IS NULL AND revoked_at IS NULL`,
		inviteTokenHash(token))
}

func (p *signupPolicy) authorizeFirstUser(ctx *limen.HookContext) bool {
	fields := additionalFields(ctx)
	if fields["purpose"] != "instance-setup" {
		p.writeSignupForbidden(ctx)
		return false
	}
	if !validSignupMode(fmt.Sprint(fields["signupMode"])) {
		p.writeSignupForbidden(ctx)
		return false
	}
	email := strings.ToLower(strings.TrimSpace(fmt.Sprint(ctx.GetJSONBodyValue("email"))))
	if !p.allowDirectSetup && !p.adminEmails[email] {
		p.writeSignupForbidden(ctx)
		return false
	}
	return true
}

func (p *signupPolicy) signupMode() (string, bool, error) {
	var mode string
	err := p.db.QueryRow(`SELECT signup_mode FROM instance_settings WHERE id = 1`).Scan(&mode)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return mode, true, nil
}

func (p *signupPolicy) signupModeValue() (string, error) {
	mode, _, err := p.signupMode()
	return mode, err
}

func (p *signupPolicy) settingsExist() (bool, error) {
	var count int
	if err := p.db.QueryRow(`SELECT COUNT(*) FROM instance_settings WHERE id = 1`).Scan(&count); err != nil {
		return false, err
	}
	return count == 1, nil
}

func (p *signupPolicy) userCount() (int, error) {
	var count int
	err := p.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&count)
	return count, err
}

func (p *signupPolicy) completeSetup(mode string, userID int64) error {
	tx, err := p.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`INSERT INTO instance_settings (
		id, signup_mode, default_invite_expiry_hours, setup_completed_at, updated_at, updated_by
	) VALUES (1, ?, 168, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
		strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), ?)`, mode, userID); err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT INTO instance_admins (user_id, granted_by, created_at)
		VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`, userID, userID); err != nil {
		return err
	}
	return tx.Commit()
}

func (p *signupPolicy) beforeOAuthCallback(ctx *limen.HookContext) bool {
	var maxUserID int64
	if err := p.db.QueryRow(`SELECT COALESCE(MAX(id), 0) FROM users`).Scan(&maxUserID); err != nil {
		p.writeInternalError(ctx, err)
		return false
	}
	state := oauthCallbackState{maxUserID: maxUserID}
	if cookie, err := ctx.Request().Cookie(oauthInviteCookieName); err == nil {
		if claim, err := p.loadOAuthInvite(cookie.Value); err == nil {
			state.claim = claim
		}
	}
	if cookie, err := ctx.Request().Cookie(oauthSetupCookieName); err == nil && validSignupMode(cookie.Value) {
		state.setupMode = cookie.Value
	}
	p.oauthUserBounds.Store(ctx.Request(), state)
	return true
}

func (p *signupPolicy) afterOAuthCallback(ctx *limen.HookContext) bool {
	defer p.oauthUserBounds.Delete(ctx.Request())
	p.clearInviteCookie(ctx)
	p.clearSetupModeCookie(ctx)
	result := ctx.GetAuthResult()
	rawState, ok := p.oauthUserBounds.Load(ctx.Request())
	if !ok {
		return true
	}
	state := rawState.(oauthCallbackState)
	if result == nil || result.User == nil {
		if state.claim != nil {
			if err := p.releaseOAuthInvite(state.claim); err != nil {
				p.writeInternalError(ctx, err)
				return false
			}
		}
		return true
	}
	userID, ok := limenUserID(result.User.ID)
	if !ok {
		if state.claim != nil {
			if err := p.releaseOAuthInvite(state.claim); err != nil {
				p.writeInternalError(ctx, err)
				return false
			}
		}
		return true
	}
	if state.claim != nil {
		if userID > state.maxUserID {
			p.removeUnauthorizedUser(ctx, userID)
			if err := p.releaseOAuthInvite(state.claim); err != nil {
				p.writeInternalError(ctx, err)
				return false
			}
			p.writeSignupForbidden(ctx)
			return false
		}
		if userID == state.claim.UserID && strings.EqualFold(strings.TrimSpace(result.User.Email), state.claim.Email) {
			if err := p.completeOAuthInvite(state.claim, userID, result.User.Email); err != nil {
				if releaseErr := p.releaseOAuthInvite(state.claim); releaseErr != nil {
					p.writeInternalError(ctx, releaseErr)
					return false
				}
				p.writeInternalError(ctx, err)
				return false
			}
			return true
		}
		if err := p.releaseOAuthInvite(state.claim); err != nil {
			p.writeInternalError(ctx, err)
			return false
		}
		return true
	}
	if userID <= state.maxUserID {
		return true
	}

	mode, configured, err := p.signupMode()
	if err != nil {
		p.writeInternalError(ctx, err)
		return false
	}
	if !configured {
		userCount, err := p.userCount()
		if err != nil {
			p.writeInternalError(ctx, err)
			return false
		}
		if userCount != 1 {
			p.writeInternalError(ctx, fmt.Errorf("first-user setup state changed during OAuth callback"))
			return false
		}
		email := strings.ToLower(strings.TrimSpace(result.User.Email))
		if !p.allowDirectSetup && !p.adminEmails[email] {
			p.removeUnauthorizedUser(ctx, userID)
			p.writeSignupForbidden(ctx)
			return false
		}
		setupMode := state.setupMode
		if setupMode == "" {
			setupMode = SignupModeInvite
		}
		if err := p.completeSetup(setupMode, userID); err != nil {
			p.removeUnauthorizedUser(ctx, userID)
			p.writeInternalError(ctx, err)
			return false
		}
		return true
	}
	if mode == SignupModeOpen {
		return true
	}
	p.removeUnauthorizedUser(ctx, userID)
	p.writeSignupForbidden(ctx)
	return false
}

func (p *signupPolicy) beforeOAuthAuthorize(ctx *limen.HookContext) bool {
	mode, configured, err := p.signupMode()
	if err != nil {
		p.writeInternalError(ctx, err)
		return false
	}
	if !configured {
		setupMode := setupModeFromRedirectURI(ctx.Request().URL.Query().Get("redirect_uri"))
		if setupMode == "" {
			setupMode = SignupModeInvite
		}
		ctx.SetResponseCookie(&http.Cookie{
			Name:     oauthSetupCookieName,
			Value:    setupMode,
			Path:     "/auth",
			MaxAge:   int((15 * time.Minute).Seconds()),
			HttpOnly: true,
			Secure:   p.secureCookies || ctx.Request().TLS != nil,
			SameSite: http.SameSiteLaxMode,
		})
		return true
	}
	if mode != SignupModeInvite {
		return true
	}
	token := inviteTokenFromRedirectURI(ctx.Request().URL.Query().Get("redirect_uri"))
	if token == "" {
		return true
	}
	claim, err := p.prepareOAuthInvite(token)
	if err != nil {
		p.writeSignupForbidden(ctx)
		return false
	}
	ctx.SetResponseCookie(&http.Cookie{
		Name:     oauthInviteCookieName,
		Value:    token,
		Path:     "/auth",
		MaxAge:   int((15 * time.Minute).Seconds()),
		HttpOnly: true,
		Secure:   p.secureCookies || ctx.Request().TLS != nil,
		SameSite: http.SameSiteLaxMode,
	})
	_ = claim
	return true
}

func (p *signupPolicy) prepareOAuthInvite(token string) (*oauthInviteClaim, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, fmt.Errorf("missing invite token")
	}
	var id, email, expiresAt string
	var acceptedAt, revokedAt, reservedAt sql.NullString
	var reservedUserID sql.NullInt64
	err := p.db.QueryRow(`
		SELECT id, email, expires_at, accepted_at, revoked_at, reserved_at, reserved_user_id
		FROM signup_invites WHERE token_hash = ?`, inviteTokenHash(token)).
		Scan(&id, &email, &expiresAt, &acceptedAt, &revokedAt, &reservedAt, &reservedUserID)
	if err != nil || acceptedAt.Valid || revokedAt.Valid || inviteExpired(expiresAt) {
		return nil, fmt.Errorf("invalid invite")
	}

	userID := reservedUserID.Int64
	createdUser := false
	if !reservedUserID.Valid {
		var existingID int64
		err := p.db.QueryRow(`SELECT id FROM users WHERE email = ?`,
			strings.ToLower(strings.TrimSpace(email))).Scan(&existingID)
		if err == sql.ErrNoRows {
			res, insertErr := p.db.Exec(`
				INSERT INTO users (email, created_at, updated_at)
				VALUES (?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
					strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
				strings.ToLower(strings.TrimSpace(email)))
			if insertErr != nil {
				return nil, insertErr
			}
			createdUser = true
			userID, insertErr = res.LastInsertId()
			if insertErr != nil {
				return nil, insertErr
			}
		} else if err != nil {
			return nil, err
		} else {
			userID = existingID
		}
	}

	now := time.Now().UTC()
	cutoff := now.Add(-10 * time.Minute).Format(time.RFC3339)
	res, err := p.db.Exec(`
		UPDATE signup_invites SET reserved_at = ?, reserved_user_id = ?
		WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL
		  AND expires_at > ? AND (reserved_at IS NULL OR reserved_at < ?)`,
		now.Format(time.RFC3339), userID, id, now.Format(time.RFC3339), cutoff)
	if err != nil {
		return nil, err
	}
	count, _ := res.RowsAffected()
	if count != 1 {
		return nil, fmt.Errorf("invite reservation unavailable")
	}
	return &oauthInviteClaim{ID: id, Email: email, UserID: userID, CreatedUser: createdUser}, nil
}

func (p *signupPolicy) releaseOAuthInvite(claim *oauthInviteClaim) error {
	if claim == nil {
		return nil
	}
	tx, err := p.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	res, err := tx.Exec(`
		UPDATE signup_invites
		SET reserved_at = NULL, reserved_user_id = NULL
		WHERE id = ? AND reserved_user_id = ? AND accepted_at IS NULL AND revoked_at IS NULL`,
		claim.ID, claim.UserID)
	if err != nil {
		return err
	}
	count, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if claim.CreatedUser && count == 1 {
		for _, query := range []string{
			`DELETE FROM sessions WHERE user_id = ?`,
			`DELETE FROM accounts WHERE user_id = ?`,
			`DELETE FROM users WHERE id = ?`,
		} {
			if _, err := tx.Exec(query, claim.UserID); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

func (p *signupPolicy) loadOAuthInvite(token string) (*oauthInviteClaim, error) {
	var id, email string
	var reservedUserID sql.NullInt64
	err := p.db.QueryRow(`
		SELECT id, email, reserved_user_id FROM signup_invites
		WHERE token_hash = ? AND accepted_at IS NULL AND revoked_at IS NULL
		  AND expires_at > ? AND reserved_user_id IS NOT NULL`,
		inviteTokenHash(token), time.Now().UTC().Format(time.RFC3339)).
		Scan(&id, &email, &reservedUserID)
	if err != nil || !reservedUserID.Valid {
		return nil, fmt.Errorf("invalid invite")
	}
	return &oauthInviteClaim{ID: id, Email: email, UserID: reservedUserID.Int64}, nil
}

func (p *signupPolicy) completeOAuthInvite(claim *oauthInviteClaim, userID int64, email string) error {
	if claim == nil || !strings.EqualFold(strings.TrimSpace(email), claim.Email) || userID != claim.UserID {
		return fmt.Errorf("OAuth identity does not match invitation")
	}
	res, err := p.db.Exec(`
		UPDATE signup_invites
		SET accepted_at = ?, accepted_by = ?, reserved_at = NULL, reserved_user_id = NULL
		WHERE id = ? AND reserved_user_id = ? AND accepted_at IS NULL AND revoked_at IS NULL
		  AND expires_at > ?`,
		time.Now().UTC().Format(time.RFC3339), userID, claim.ID, claim.UserID,
		time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		return err
	}
	count, _ := res.RowsAffected()
	if count != 1 {
		return fmt.Errorf("invite reservation was not accepted")
	}
	return nil
}

func (p *signupPolicy) clearInviteCookie(ctx *limen.HookContext) {
	ctx.SetResponseCookie(&http.Cookie{
		Name:     oauthInviteCookieName,
		Value:    "",
		Path:     "/auth",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   p.secureCookies || ctx.Request().TLS != nil,
		SameSite: http.SameSiteLaxMode,
	})
}

func (p *signupPolicy) clearSetupModeCookie(ctx *limen.HookContext) {
	ctx.SetResponseCookie(&http.Cookie{
		Name:     oauthSetupCookieName,
		Value:    "",
		Path:     "/auth",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   p.secureCookies || ctx.Request().TLS != nil,
		SameSite: http.SameSiteLaxMode,
	})
}

func (p *signupPolicy) removeUnauthorizedUser(ctx *limen.HookContext, userID int64) {
	_, _ = p.db.Exec(`DELETE FROM sessions WHERE user_id = ?`, userID)
	_, _ = p.db.Exec(`DELETE FROM accounts WHERE user_id = ?`, userID)
	_, _ = p.db.Exec(`DELETE FROM users WHERE id = ?`, userID)
	ctx.RemoveResponseCookie("limen_session")
	ctx.RemoveResponseCookie("limen_short_session")
}

func (p *signupPolicy) writeInternalError(ctx *limen.HookContext, err error) {
	ctx.WriteErrorResponse(limen.NewLimenError("signup policy unavailable", http.StatusInternalServerError, err))
}

func (p *signupPolicy) writeSignupForbidden(ctx *limen.HookContext) {
	ctx.WriteErrorResponse(limen.NewLimenError("signup is not allowed", http.StatusForbidden, nil))
}

func additionalFields(ctx *limen.HookContext) map[string]any {
	// The React client flattens additionalFields into the top-level request;
	// retain nested parsing for direct API clients.
	raw := ctx.GetJSONBodyValue("additionalFields")
	fields, _ := raw.(map[string]any)
	if fields == nil {
		fields = map[string]any{}
		for _, key := range []string{"purpose", "inviteToken", "signupMode"} {
			if value := ctx.GetJSONBodyValue(key); value != nil {
				fields[key] = value
			}
		}
	}
	return fields
}

func signupModeFromBody(ctx *limen.HookContext) string {
	mode := fmt.Sprint(additionalFields(ctx)["signupMode"])
	if !validSignupMode(mode) {
		return ""
	}
	return mode
}

func validSignupMode(mode string) bool {
	return mode == SignupModeOpen || mode == SignupModeInvite || mode == SignupModeClosed
}

func limenUserID(raw any) (int64, bool) {
	switch id := raw.(type) {
	case int64:
		return id, true
	case int:
		return int64(id), true
	case float64:
		return int64(id), true
	default:
		return 0, false
	}
}

func isLocalBaseURL(raw string) bool {
	parsed, err := url.Parse(raw)
	if err != nil {
		return false
	}
	host := parsed.Hostname()
	return host == "" || host == "localhost" || host == "127.0.0.1" || host == "::1"
}

func isSecureBaseURL(raw string) bool {
	parsed, err := url.Parse(raw)
	return err == nil && parsed.Scheme == "https"
}

func inviteTokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func inviteExpired(value string) bool {
	expiresAt, err := time.Parse(time.RFC3339, value)
	return err != nil || !time.Now().UTC().Before(expiresAt)
}

func inviteTokenFromRedirectURI(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	values, err := url.ParseQuery(parsed.Fragment)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(values.Get("invite"))
}

func setupModeFromRedirectURI(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	values, err := url.ParseQuery(parsed.Fragment)
	if err != nil {
		return ""
	}
	mode := strings.ToUpper(strings.TrimSpace(values.Get("setup")))
	if !validSignupMode(mode) {
		return ""
	}
	return mode
}
