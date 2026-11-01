# zer

zer is a self-hostable family graph engine and patronymic lineage platform for Ethiopian and non-Western family structures. It ships as a single Go binary with an embedded React single-page application and per-tree SQLite storage.

## Core Capabilities

- Patronymic Name Synthesis: Computes full names dynamically at runtime by walking up parent edges where `is_name_source = 1`. Individuals carry only given names; there are no surname or last name columns.
- Script Neutrality: Tracks both original native script (`given_name_native`) and Romanized transliteration (`given_name_latin`) without hardcoding Amharic or Fidel assumptions, accommodating languages such as Afaan Oromoo, Tigrinya, and others.
- Dual Calendar Engine: Bidirectional conversion between Ethiopian Calendar (EC) and Gregorian Calendar (GC) powered by `ethioqen-go`, with support for Pagume (13th month) and partial dates.
- Interactive Graph Canvas: D3 and SVG-driven hierarchical pedigree layout featuring dual-wing multi-spouse distribution, stepped overpass routing to prevent card collisions, relationship line types (biological, adoptive, foster), union statuses (active, dissolved, widowed), and a dynamic canvas legend.
- Kinship Pathfinding: General-purpose breadth-first search (BFS) traversing arbitrary generational depths (`depth=N`) to compute degrees of relation and connection paths between any two individuals.
- Multilingual Interface: Complete UI localization across English, Amharic (አማርኛ), Afaan Oromoo, and Tigrinya (ትግርኛ).
- Multi-Tenancy and Access Control: Database-per-tree model with tree-level role-based access control (Owner, Admin, Editor, Viewer).

## Architecture

- Single Binary Distribution: Go single binary embedding the compiled frontend bundle (`//go:embed web/dist/*`).
- Database-per-Tree Storage:
  - `data/master.sqlite`: Global user accounts, Limen authentication session state, instance settings, tree registry, and tree membership records.
  - `data/trees/{tree_id}.sqlite`: Isolated graph databases for each family tree containing individuals, relationships, and events.
- Relational Primitives: The database stores only two relationship types: `parent_child` (directed edge with `is_name_source` flag and `relationship_type`) and `unions` (partnership with `union_type` and `status`). All extended relationships (siblings, cousins, aunts, uncles, in-laws) are computed at query time.
- Pure Go SQLite: Uses `modernc.org/sqlite` with zero CGO dependencies, designed to operate comfortably on low-memory VPS environments (`GOMEMLIMIT=180MiB`).
- Authentication: Built on Limen Auth (`github.com/thecodearcher/limen`) on the backend and `limen-auth` on the frontend, supporting email/password and Google OAuth.

## Layout

- `cmd/zer`: CLI entrypoint, HTTP server bootstrapper, and seed command
- `internal/api`: HTTP handlers and routing
- `internal/auth`: Limen Auth integration and OAuth configuration
- `internal/calendar`: Ethiopian calendar conversion adapter wrapping `ethioqen-go`
- `internal/database`: SQLite multi-database connection pool and schema migrations
- `internal/lineage`: Patronymic name synthesizer, cycle detection, and kinship pathfinder
- `internal/seed`: Deterministic demo fixtures (`zer seed`)
- `web`: React frontend (Vite, Tailwind CSS, Limen Auth SDK)
- `data`: Gitignored local database storage directory

## Configuration

Copy `.env.example` to `.env` and configure runtime values:

```bash
PORT=8080
BASE_URL=http://localhost:8080
LIMEN_SECRET=replace-with-32-characters
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
AUTH_GOOGLE_ENABLED=true
AUTH_PASSWORD_ENABLED=true
ADMIN_EMAILS=
ZER_ALLOW_DEMO_SEED=0
```

- `PORT`: HTTP port for the web server (defaults to 8080).
- `BASE_URL`: Public base URL of the instance.
- `LIMEN_SECRET`: 32-character secret key for signing session tokens.
- `AUTH_GOOGLE_ENABLED` / `AUTH_PASSWORD_ENABLED`: Feature flags for authentication methods.
- `ADMIN_EMAILS`: Comma-separated emails granted instance administrative privileges on non-local instances.
- `ZER_ALLOW_DEMO_SEED`: Set to 1 to allow running the demo seed on non-local instances.

## Accounts and Signup

On a fresh instance, the sign-in screen displays a first-run setup form. The initial account becomes an instance administrator and selects the default registration mode:

- Open: Anyone with the instance URL can register through any enabled provider.
- Invite-only: New accounts require a valid, unexpired invite issued by an administrator.
- Closed: New registrations are disabled; existing users can continue signing in.

Invites are single-use tokens hashed in `master.sqlite`. Invites provide instance access; tree permissions are granted separately per family tree.

## Demo Seed Data

To populate the local instance with sample family trees demonstrating patronymic lineages, remarriage, adoption, and foster relationships:

```bash
go run ./cmd/zer seed
```

Pre-configured demo accounts (password: `Demo1234`):

- `haile@demo.example.com`: Haile Lineage (four-generation patronymic lineage)
- `senait@demo.example.com`: Senait Line (matronymic-led family with partial dates)
- `wondimu@demo.example.com`: Adoptive Household (adoptive, foster, and half-sibling relationships)
- `rahel@demo.example.com`: Blended Remarriage (sequential unions and blended families)
- `mekdes@demo.example.com`: Sparse Records (single-parent households with year-only dates)

The seed command runs only when `BASE_URL` is set to a local address, or when `ZER_ALLOW_DEMO_SEED=1` is provided.

## Development

### Prerequisites

- Go toolchain (version 1.27 or higher, see `go.mod`)
- Node.js (version 20 or higher) and pnpm 11

### Installing Dependencies

```bash
pnpm --dir web install
```

### Running the Application

Build the frontend bundle and start the Go server:

```bash
pnpm --dir web build
go run ./cmd/zer
```

The web interface will be available at `http://localhost:8080`.

For frontend hot module replacement, run the Vite development server in a separate terminal:

```bash
pnpm --dir web dev
```

Vite proxies `/api` and `/auth` requests to the Go backend running on port 8080.

### Running Tests

Run the Go backend test suite:

```bash
go test ./...
```

Run the frontend test suite:

```bash
pnpm --dir web test
```

### Linting

Run frontend static analysis:

```bash
pnpm --dir web lint
```

### Code Formatting

Format frontend code with oxfmt:

```bash
pnpm --dir web format
```

### Compiling Production Binary

```bash
pnpm --dir web build
go build ./cmd/zer
```

The resulting `zer` executable contains all backend logic and embedded frontend assets.

### Container Deployment

```bash
docker compose up -d
```

The multi-stage `Dockerfile` compiles the frontend before building the Go application.

## License

MIT, see LICENSE.
