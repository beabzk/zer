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

## Accounts and signup

On a fresh instance, the sign-in screen becomes a first-run setup form. The first account becomes an instance admin and chooses the initial signup mode. The default is invite-only. On a non-local `BASE_URL`, the email returned by the selected auth provider must be listed in `ADMIN_EMAILS`; local instances allow direct setup for development.

Instance admins can switch between three modes:

- Open: anyone with the instance URL can create an account through any enabled provider.
- Invite-only: a new account requires a valid, unexpired, unrevoked invite for the same email address.
- Closed: new account creation is disabled, while existing users can still sign in.

Invites are single-use and do not grant access to any family tree. The full invite link is shown only when it is created because the database stores only a token hash. Tree membership is assigned separately after the invited user creates an account.

The demo seed runs only when `BASE_URL` is local. Set `ZER_ALLOW_DEMO_SEED=1` to override that guard for a non-local demonstration instance.

## Development

- Go toolchain: see go.mod. pnpm 11 for the frontend.
- Install frontend dependencies once: `pnpm --dir web install`
- Development server: run `pnpm --dir web build`, then `go run ./cmd/zer`. Go serves the compiled bundle embedded at compile time on port 8080.
- Open the UI at `http://localhost:8080`. Go prints the UI and health-check URLs after it starts listening.
- After frontend changes, run `pnpm --dir web build` again and restart Go.
- For frontend hot reload, run `pnpm --dir web dev` separately. Vite proxies `/api` and `/auth` to Go on port 8080.
- Production binary: run `pnpm --dir web build`, then `go build ./cmd/zer`. The resulting Go binary contains `web/dist`.
- Health check: `GET /healthz`
- Seed demo trees: `go run ./cmd/zer seed`
- Container deploy: `docker compose up -d` (see docker-compose.yml). The Dockerfile builds `web` before compiling Go.

## License

MIT, see LICENSE.
