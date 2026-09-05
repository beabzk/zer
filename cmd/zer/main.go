// Command zer starts the single-binary server for the API and embedded SPA.
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/joho/godotenv"
	credentialpassword "github.com/thecodearcher/limen/plugins/credential-password"

	"github.com/beabzk/zer/internal/api"
	"github.com/beabzk/zer/internal/auth"
	"github.com/beabzk/zer/internal/database"
	"github.com/beabzk/zer/internal/seed"
	zerweb "github.com/beabzk/zer/web"
)

// version stamps the release tag at build time via
// -ldflags "-X main.version=v0.1.0". Development builds report dev.
var version = "dev"

func main() {
	if len(os.Args) > 1 && (os.Args[1] == "--version" || os.Args[1] == "-version" || os.Args[1] == "-v") {
		fmt.Println(version)
		return
	}
	if len(os.Args) > 1 && os.Args[1] == "seed" {
		if err := runSeed(); err != nil {
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

// runSeed creates every demo tree with its owner account.
func runSeed() error {
	_ = godotenv.Load()

	ctx := context.Background()
	manager := database.NewManager(envOr("DATA_DIR", "data"))
	defer manager.Close()
	master, err := manager.Master(ctx)
	if err != nil {
		return err
	}
	cfg := configFromEnv()
	engine, err := auth.InitAuth(master, cfg.baseURL, false, true)
	if err != nil {
		return err
	}
	hasher := credentialpassword.Use(engine)
	report, err := seed.SeedAll(ctx, manager, hasher.HashPassword)
	if err != nil {
		return err
	}
	for _, r := range report {
		fmt.Printf("seeded %s (%s): %d people\n", r.Slug, r.ID, r.People)
	}
	return nil
}

func run() error {
	// Local .env stays optional so deployed environments can rely on
	// real environment variables instead.
	_ = godotenv.Load()

	cfg := configFromEnv()

	manager := database.NewManager(cfg.dataDir)

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

	r.Handle("/*", zerweb.Handler())

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
	dataDir         string
	googleEnabled   bool
	passwordEnabled bool
}

func configFromEnv() serverConfig {
	return serverConfig{
		port:            envOr("PORT", "8080"),
		baseURL:         envOr("BASE_URL", "http://localhost:8080"),
		dataDir:         envOr("DATA_DIR", "data"),
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
