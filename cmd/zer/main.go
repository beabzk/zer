// Command zer starts the single-binary server for the API and embedded SPA.
package main

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/joho/godotenv"

	"github.com/beabzk/zer/internal/api"
	"github.com/beabzk/zer/internal/auth"
	"github.com/beabzk/zer/internal/database"
	"github.com/beabzk/zer/internal/seed"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "seed" {
		if err := runSeed(os.Args[2:]); err != nil {
			fmt.Fprintln(os.Stderr, "seed: "+err.Error())
			os.Exit(1)
		}
		return
	}
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}
}

// runSeed creates a new tree filled with the deterministic demo fixture.
// Usage: zer seed --name "Demo" [--slug demo] --user-email you@example.com
func runSeed(args []string) error {
	flags := flag.NewFlagSet("seed", flag.ContinueOnError)
	name := flags.String("name", "Demo Family", "tree name")
	slug := flags.String("slug", "", "tree slug, derived from the name when empty")
	email := flags.String("user-email", "", "owner account email (required)")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if strings.TrimSpace(*email) == "" {
		return fmt.Errorf("--user-email is required")
	}
	if strings.TrimSpace(*slug) == "" {
		*slug = deriveSlug(*name)
	}
	_ = godotenv.Load()

	ctx := context.Background()
	manager := database.NewManager("data")
	defer manager.Close()
	master, err := manager.Master(ctx)
	if err != nil {
		return err
	}
	var userID int64
	if err := master.QueryRowContext(ctx,
		`SELECT id FROM users WHERE email = ?`, strings.ToLower(strings.TrimSpace(*email))).Scan(&userID); err != nil {
		return fmt.Errorf("unknown user %q: sign up or log in once first", *email)
	}
	treeID, err := seed.DemoTree(ctx, manager, userID, strings.TrimSpace(*name), *slug)
	if err != nil {
		return err
	}
	fmt.Printf("seeded tree %s (%s)\n", treeID, *slug)
	return nil
}

func deriveSlug(name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	var b strings.Builder
	prevDash := true
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z' || r >= '0' && r <= '9':
			b.WriteRune(r)
			prevDash = false
		case r == ' ' || r == '_' || r == '-':
			if !prevDash {
				b.WriteRune('-')
				prevDash = true
			}
		}
	}
	return strings.Trim(b.String(), "-")
}

func run() error {
	// Local .env stays optional so deployed environments can rely on
	// real environment variables instead.
	_ = godotenv.Load()

	cfg := configFromEnv()

	manager := database.NewManager("data")

	ctx := context.Background()
	master, err := manager.Master(ctx)
	if err != nil {
		manager.Close()
		return err
	}
	engine, err := auth.InitAuth(master, cfg.baseURL, cfg.googleEnabled, cfg.passwordEnabled)
	if err != nil {
		manager.Close()
		return err
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	// Handle keeps the full path, which the Limen router matches verbatim.
	r.Handle("/auth/*", engine.Handler())

	api.Mount(r, api.Deps{Manager: manager, Engine: engine, AdminEmails: api.ParseAdminEmails(os.Getenv("ADMIN_EMAILS"))})

	srv := &http.Server{Addr: ":" + cfg.port, Handler: r}
	errCh := make(chan error, 1)
	go func() {
		errCh <- srv.ListenAndServe()
	}()

	sigCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	select {
	case err := <-errCh:
		manager.Close()
		if err != nil && err != http.ErrServerClosed {
			return err
		}
		return nil
	case <-sigCtx.Done():
		fmt.Fprintln(os.Stderr, "shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			manager.Close()
			return err
		}
		return manager.Close()
	}
}

type serverConfig struct {
	port            string
	baseURL         string
	googleEnabled   bool
	passwordEnabled bool
}

func configFromEnv() serverConfig {
	return serverConfig{
		port:            envOr("PORT", "8080"),
		baseURL:         envOr("BASE_URL", "http://localhost:8080"),
		googleEnabled:   envFlag("AUTH_GOOGLE_ENABLED", true),
		passwordEnabled: envFlag("AUTH_PASSWORD_ENABLED", true),
	}
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envFlag(key string, fallback bool) bool {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value == "true" || value == "1"
}
