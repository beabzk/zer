// Package auth builds the Limen Auth engine for zer. The deployer enables
// Google OAuth, password auth, or both through configuration. Limen serves
// its routes under /auth, application APIs live under /api/v1.
package auth

import (
	"database/sql"
	"errors"

	"github.com/thecodearcher/limen"
	sqladapter "github.com/thecodearcher/limen/adapters/sql"
	credentialpassword "github.com/thecodearcher/limen/plugins/credential-password"
	"github.com/thecodearcher/limen/plugins/oauth"
	oauthgoogle "github.com/thecodearcher/limen/plugins/oauth-google"
)

// InitAuth wires Limen against the master database. baseURL is the public
// origin, used to build OAuth callback URLs as {baseURL}/auth/oauth/{provider}/callback.
// The signing secret comes from Config Secret or LIMEN_SECRET and must hold
// 32 bytes. At least one method stays enabled.
func InitAuth(db *sql.DB, baseURL string, googleEnabled, passwordEnabled bool) (*limen.Limen, error) {
	if !googleEnabled && !passwordEnabled {
		return nil, errors.New("auth: enable google, password, or both")
	}
	plugins := make([]limen.Plugin, 0, 2)
	if passwordEnabled {
		plugins = append(plugins, credentialpassword.New())
	}
	if googleEnabled {
		// The Google provider reads GOOGLE_CLIENT_ID and
		// GOOGLE_CLIENT_SECRET from the environment by default.
		plugins = append(plugins, oauth.New(oauth.WithProviders(oauthgoogle.New())))
	}
	return limen.New(&limen.Config{
		BaseURL:  baseURL,
		Database: timeFormatAdapter{sqladapter.NewSQLite(db)},
		Plugins:  plugins,
	})
}
