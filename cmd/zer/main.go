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

	"github.com/beabzk/zer/internal/api"
	"github.com/beabzk/zer/internal/auth"
	"github.com/beabzk/zer/internal/database"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}
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
