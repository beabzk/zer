# zer

zer is a self-hostable family graph engine for patronymic and non-Western lineage structures. It ships as a single Go binary with an embedded React SPA and per-tree SQLite storage.

## Layout

- cmd/zer: server entrypoint and router bootstrapper
- internal/api: HTTP handlers and routing
- internal/auth: Limen Auth setup
- internal/calendar: Ethiopian calendar conversion wrapper
- internal/database: SQLite connection pool and migrations
- internal/lineage: name synthesizer and graph traversal
- internal/seed: deterministic demo data (`zer seed`)
- web: React frontend (Vite, Tailwind CSS), embedded into the binary
- data: local runtime storage, gitignored

## Configuration

Copy `.env.example` to `.env` and set values. The server reads `PORT`, `BASE_URL`, `DATA_DIR`, `LIMEN_SECRET`, Google OAuth credentials, auth method flags, and `ADMIN_EMAILS`.

## Development

- Go toolchain: see go.mod. pnpm 11 for the frontend.
- Build the frontend first, the Go binary embeds it: `pnpm --dir web install && pnpm --dir web build`
- Run the API: `go run ./cmd/zer`
- Health check: `GET /healthz`
- Seed demo trees: `go run ./cmd/zer seed`
- Container deploy: `docker compose up -d` (see docker-compose.yml)

## License

MIT, see LICENSE.
