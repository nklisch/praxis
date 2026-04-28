# Praxis

An open-source AI tutoring framework. Praxis powers adaptive, personalized tutoring sessions backed by a concept graph, spaced-repetition memory, and a pluggable engine layer.

## Quickstart

```bash
# Prerequisites: Node >= 24, pnpm 9
node --version   # must be >= 24
corepack enable  # activates pnpm from packageManager field

# Install dependencies
pnpm install

# Type-check all packages
pnpm typecheck

# Run smoke tests
pnpm test

# Initialize the local database
pnpm db:migrate

# Inspect the database schema
pnpm db:show
```

## Package layout

| Package | Description |
|---|---|
| `@praxis/core` | Orchestrator — DB module, shared types, domain composition |
| `@praxis/engines` | LLM engine adapters (Anthropic, OpenAI, local) |
| `@praxis/memory` | Episodic + semantic memory, student model projections |
| `@praxis/artifacts` | Courses, lessons, assignments, notes, flashcards |
| `@praxis/tools` | Deterministic and grounded tool implementations |
| `@praxis/curriculum` | Concept graphs, prerequisite edges, pedagogy packs |
| `@praxis/client` | RPC client types and transport layer |
| `@praxis/ui` | React component library for the tutor UI |
| `@praxis/desktop` | Electron entry point — mounts core + UI |

## Development scripts

| Script | What it does |
|---|---|
| `pnpm build` | Compile all packages via TypeScript project references |
| `pnpm typecheck` | Type-check all packages (no emit) |
| `pnpm test` | Run Vitest suite across all packages |
| `pnpm lint` | Biome check (lint + format verify) |
| `pnpm lint:fix` | Biome check with auto-fix applied |
| `pnpm db:migrate` | Apply pending Drizzle migrations |
| `pnpm db:generate` | Generate migration SQL from schema changes |
| `pnpm db:show` | Print all tables and row counts |
| `pnpm db:reset` | Delete dev DB and re-migrate from scratch |

## Architecture and design docs

See `docs/` for the full design documentation:

- `docs/ARCHITECTURE.md` — dependency direction rules and system boundaries
- `docs/CONTRACT.md` — canonical type SSOT for cross-package interfaces
- `docs/designs/` — per-phase implementation designs
