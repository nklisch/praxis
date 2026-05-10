# Praxis

An open-source AI tutoring framework. Praxis powers adaptive, personalized tutoring sessions backed by a concept graph, spaced-repetition memory, and a pluggable engine layer.

## Quickstart

```bash
# Prerequisites: Node >= 24 (Node 25 works), pnpm 10
node --version    # must be >= 24

# Install pnpm 10.33+ — pick one path
corepack enable                       # if Node ships with corepack (Node ≤ 24)
# OR
npm install -g pnpm@10.33.2           # Node 25+ no longer bundles corepack

# Install workspace dependencies (no build steps run on install — see Native modules)
pnpm install

# Initialize the local SQLite dev database
pnpm db:migrate

# Type-check (uses tsgo — TypeScript's native Go-based compiler, ~10× faster than tsc)
pnpm typecheck

# Run the test suite (Vitest)
pnpm test

# Watch mode — re-runs affected tests on save
pnpm test:watch

# Lint + format check (Biome)
pnpm lint
```

## Run the desktop app (dev)

```bash
# First-time setup: rebuild native modules against Electron's ABI
pnpm --filter @praxis/desktop rebuild:electron

# Run dev — rebuilds workspace dist/ first, then starts Electron + Vite hot-reload
pnpm dev
```

`pnpm dev` runs `pnpm build` first because the Electron main process keeps
workspace packages (`@praxis/engines`, `@praxis/claude-cli-sdk`, etc.)
**external** in the bundle — at runtime, Node loads each one from its own
`dist/` rather than the bundled `out/main/index.js`. Without rebuilding,
source-level changes to those packages won't appear in the running app and
you'll see stale-code symptoms (e.g. an old hang resurfacing despite the fix
being committed in source).

The `dist:*` standalone-build pipeline already starts with `pnpm build`, so
this change does not affect packaged builds.

Run `rebuild:electron` again after any `pnpm install` that updates
`better-sqlite3` or `canvas`. After that, tests and CLI scripts will fail with
`NODE_MODULE_VERSION` errors — restore the Node-ABI bindings with:

```bash
pnpm rebuild better-sqlite3 canvas    # rebuilds against the active Node version
```

This native-module dance is unavoidable as long as tests and Electron share
`node_modules` (and since `dist:*` reuses the workspace's pnpm store via
hardlinks, it has the same effect on workspace native modules — run the
`pnpm rebuild` line above after a `dist:*` run before going back to tests /
`pnpm dev`).

## Build a distributable

The `dist:*` scripts run a multi-step pipeline (`packages/desktop/scripts/build-dist.sh`):

1. `pnpm build` — compile all workspace `dist/`
2. `electron-vite build` — bundle main/preload/renderer into `packages/desktop/out/`
3. `pnpm deploy --inject-workspace-packages` to `/tmp/praxis-desktop-deploy/` — flattens
   the workspace + transitive deps into a self-contained directory. Required because
   electron-builder's pnpm tracer doesn't follow transitives through pnpm's isolated
   layout (without this, the asar is missing things like `bindings`, `@ai-sdk/gateway`,
   `@opentelemetry/api`).
4. Copy the workspace's `drizzle/` migrations into the deploy and patch its
   `extraResources.from` to a deploy-relative path
5. `electron-rebuild` against the deploy's `node_modules` for Electron's ABI
6. `electron-builder --<target>` from the deploy directory
7. Post-process the asar to undo electron-builder's `@praxis/X@@praxis/X/...` path
   mangling on the injected workspace packages
8. Ad-hoc resign the resulting `.app` (arm64 requires a signature)

The deploy directory location is overridable via `PRAXIS_DEPLOY_DIR` (default
`/tmp/praxis-desktop-deploy`). Output is mirrored into `packages/desktop/release/`.

```bash
# macOS (.dmg + .zip in packages/desktop/release/)
pnpm --filter @praxis/desktop dist:mac

# Windows (.exe NSIS installer)
pnpm --filter @praxis/desktop dist:win

# Linux (.AppImage + .deb)
pnpm --filter @praxis/desktop dist:linux

# Unpacked .app directory only — fastest, useful for smoke-testing the bundle
pnpm --filter @praxis/desktop dist:dir
```

Notes:
- Builds are unsigned. macOS first-run requires right-click → Open to bypass Gatekeeper; Windows shows a SmartScreen warning until reputation builds. See `docs/refactors/` for code-signing rollout notes.
- Cross-compile is limited: native modules must rebuild on the target OS. Build macOS artifacts on macOS, Windows on Windows, etc.
- Output lands at `packages/desktop/release/` (gitignored).

## Native modules

Praxis pulls in two native modules that need a C++ toolchain at install time:

| Module | Used by | Notes |
|---|---|---|
| `better-sqlite3` | core, tools | Rebuilt for Electron via `pnpm --filter @praxis/desktop rebuild:electron`; rebuilt for Node via `pnpm rebuild better-sqlite3` |
| `canvas` | tools (PDF page rendering) | Same dual-rebuild story as better-sqlite3 |

JS sandbox uses QuickJS WASM (`quickjs-emscripten`) — no native build required.

If `pnpm install` fails with a `node-gyp` error, install Xcode Command Line
Tools (macOS) or build-essential (Linux). On macOS Apple Silicon, also ensure
you have Python 3 on PATH.

## Package layout

| Package | Description |
|---|---|
| `@praxis/core` | Orchestrator — DB module, shared types, service composition, session loop, ingestion, sketch |
| `@praxis/engines` | LLM engine adapters (Claude Code, Codex, Direct via Vercel AI SDK) |
| `@praxis/memory` | Episodic + semantic memory, student-model projections |
| `@praxis/artifacts` | Courses, lessons, assignments, exams, gates, flashcards, notes, concept maps |
| `@praxis/tools` | Deterministic and grounded tool implementations; Zod schemas |
| `@praxis/curriculum` | Modes, gating logic, adaptive routing, knowledge graph, pedagogy packs |
| `@praxis/client` | RPC client types and transport layer |
| `@praxis/ui` | React SPA — student chat / progress map / workspace / configure |
| `@praxis/claude-cli-sdk` | First-party TypeScript wrapper around the Claude Code CLI subprocess. Originally forked from `@nklisch/claude-cli-sdk` and brought in-tree so `pnpm deploy --inject-workspace-packages` could see it; Praxis is the only consumer, so it's owned and modified freely as a regular workspace package |
| `@praxis/desktop` | Electron host: starts core in main process, mounts IPC, loads UI bundle in renderer |

## Development scripts

### Build, check, test
| Script | What it does |
|---|---|
| `pnpm build` | Compile all packages via TypeScript project references |
| `pnpm typecheck` | Type-check all packages (uses `tsgo`, the TS native compiler) |
| `pnpm test` | Run the Vitest suite across all packages |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm lint` | Biome check (lint + format verify) |
| `pnpm lint:fix` | Biome check with auto-fix applied |
| `pnpm format` | Biome format-write only (skip lint diagnostics) |

To run a single test file or test name:
```bash
pnpm vitest run packages/core/src/__tests__/foo.test.ts
pnpm vitest run -t "describes substring"
```

### Database
| Script | What it does |
|---|---|
| `pnpm db:migrate` | Apply pending Drizzle migrations to `.praxis/dev.db` |
| `pnpm db:generate` | Generate migration SQL from schema changes |
| `pnpm db:show` | Print all tables and row counts |
| `pnpm db:reset` | Non-interactive: delete the dev DB (keeping caches) and re-migrate from scratch |
| `pnpm dev:reset` | Interactive: broader reset of all per-machine dev state (DB + page images + main-process logs + transformers.js model cache). See **Reset dev state** below. |

**Domain inspectors** — small read-only scripts that pretty-print the dev DB for a single subsystem. Useful when debugging a specific feature without firing up the desktop app:

```bash
pnpm db:episodic            # session episodic event log
pnpm db:mastery             # BKT-style concept mastery scores
pnpm db:grades              # assignment submissions + grades
pnpm db:gates               # gate states and unlock evidence
pnpm db:packs               # imported canonical knowledge packs
pnpm db:configurator-actions  # configure-mode audit log
pnpm db:cards-due           # FSRS flashcards due for review
```

### Desktop app
| Script | What it does |
|---|---|
| `pnpm dev` | Rebuild workspace `dist/` and run the Electron desktop app in dev mode (requires `rebuild:electron` first) |
| `pnpm desktop:build` | Build the Electron bundle (unpackaged) into `packages/desktop/out/` |
| `pnpm desktop:start` | Start the prebuilt Electron app from `packages/desktop/out/` (no rebuild) |
| `pnpm --filter @praxis/desktop rebuild:electron` | Rebuild native modules against Electron's Node ABI |
| `pnpm --filter @praxis/desktop dist:dir` | Build unpacked Electron app directory (fast, no installer) |
| `pnpm --filter @praxis/desktop dist:mac` | Build macOS `.dmg` + `.zip` |
| `pnpm --filter @praxis/desktop dist:win` | Build Windows NSIS installer |
| `pnpm --filter @praxis/desktop dist:linux` | Build Linux `.AppImage` + `.deb` |

## Reset dev state

Two scripts wipe per-machine state. Pick by scope:

```bash
pnpm db:reset       # just the SQLite DB; non-interactive; preserves caches
pnpm dev:reset      # everything below; interactive prompt by default

# pnpm dev:reset accepts:
#   --yes / -y      skip the confirm prompt (useful for CI / automation)
#   --keep-cache    leave the transformers.js model cache in place (saves a re-download)
```

`pnpm dev:reset` removes:
- The dev SQLite DB(s) — both `./.praxis/dev.db` and `./packages/desktop/.praxis/dev.db`, plus their `-wal` / `-shm` sidecars, plus any path set via `PRAXIS_DB_PATH`.
- The page-images directory (where the vision-PDF ingestor caches per-page renders). Default per-platform path; `PRAXIS_PAGE_IMAGES_DIR` overrides.
- The Electron main-process log file at `<userData>/logs/praxis.log` (and rotated variants).
- The transformers.js model cache under `node_modules/.pnpm/@huggingface+transformers@*/...` (in-repo dev path). Skip with `--keep-cache` if you don't want to re-download embeddings on next boot.

Source code, migrations, and `node_modules/` are never touched — `pnpm install` is the right tool for those.

After either reset, the next `pnpm dev` boot creates a fresh DB and applies all migrations.

## Where dev state lives

| What | Path |
|---|---|
| Dev SQLite DB | `./.praxis/dev.db` (CLI scripts) and `./packages/desktop/.praxis/dev.db` (Electron) |
| Page images cache | `~/Library/Application Support/Praxis/document-pages` (macOS), `%APPDATA%/Praxis/document-pages` (Windows), `~/.local/share/praxis/document-pages` (Linux) |
| Main-process log | `<userData>/logs/praxis.log` — `userData` is Electron's per-app config dir under `@praxis/desktop` |
| Embeddings model cache | `node_modules/.pnpm/@huggingface+transformers@*/.../.cache` (dev) or `<userData>/transformers-cache` (packaged) |

Override DB path: `PRAXIS_DB_PATH=/tmp/foo.db pnpm dev`.
Override page-images dir: `PRAXIS_PAGE_IMAGES_DIR=/tmp/pages pnpm dev`.

## Stack contract

- **Runtime**: Node ≥ 24 (Node 25 works), ESM-only
- **Package manager**: pnpm 10 with workspace protocol
- **Language**: TypeScript 6 (strict, `verbatimModuleSyntax: true`)
- **Type-checker**: `tsgo` from `@typescript/native-preview` (the future TS 7)
- **Database**: SQLite via Drizzle ORM 0.45 + better-sqlite3 12
- **UI**: React 19 + TanStack Router, packaged via Electron 41 + electron-vite
- **Testing**: Vitest 3 with per-package `vitest.config.ts`, root workspace via `vitest.workspace.ts`
- **Lint + format**: Biome 2 — single tool, no ESLint, no Prettier

## Architecture and design docs

See `docs/` for the full design documentation:

- `docs/VISION.md` — what Praxis is and isn't
- `docs/ARCHITECTURE.md` — dependency direction rules and system boundaries
- `docs/CONTRACT.md` — canonical type SSOT for cross-package interfaces
- `docs/designs/` — per-phase implementation designs (phases 1–16 shipped)
- `docs/refactors/` — refactor plans (latest: post-phase-12)

For agent-facing project conventions, see `CLAUDE.md` and `.claude/skills/patterns/`.
