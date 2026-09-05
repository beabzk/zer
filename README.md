# zer

zer is a self-hostable family graph engine for patronymic and non-Western lineage structures. It ships as a single Go binary with an embedded React SPA and per-tree SQLite storage.

## Layout

- cmd/zer: server entrypoint and router bootstrapper
- internal/api: HTTP handlers and routing
- internal/auth: Limen Auth setup
- internal/calendar: Ethiopian calendar conversion wrapper
- internal/database: SQLite connection pool and migrations
- internal/export: JSON and GEDCOM adapters
- internal/lineage: name synthesizer and graph traversal
- web: React frontend (Vite, Tailwind CSS)
- data: local runtime storage, gitignored

## Configuration

Copy `.env.example` to `.env` and set values. The server reads `PORT`, `BASE_URL`, `LIMEN_SECRET`, Google OAuth credentials, and auth method flags.

## Development

- Go toolchain: see go.mod
- Run the API: `go run ./cmd/zer`
- Health check: `GET /healthz`

## License

MIT, see LICENSE.
