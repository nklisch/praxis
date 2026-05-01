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

# Run the test suite (Vitest, ~1100 tests)
pnpm test

# Lint + format check (Biome)
pnpm lint
```

## Run the desktop app (dev)

The desktop app uses native modules (`better-sqlite3`, `canvas`) that have to be
rebuilt against Electron's Node ABI before the app can launch. Electron-rebuild
is **not** wired into `postinstall` — it would clobber the Node-ABI bindings
that `pnpm test` and CLI scripts need. Run it explicitly the first time, and
again after any `pnpm install` that updated those modules:

```bash
pnpm --filter @praxis/desktop rebuild:electron
pnpm dev                              # Electron + Vite hot-reload
```

After running `rebuild:electron`, native modules are at Electron's ABI. Tests
and CLI scripts will then fail with `NODE_MODULE_VERSION` errors — restore the
Node-ABI bindings with:

```bash
pnpm rebuild better-sqlite3 canvas    # rebuilds against the active Node version
```

This dance is unavoidable as long as both contexts share `node_modules` (and
since `dist:*` reuses the workspace's pnpm store via hardlinks, it has the
same effect on workspace native modules — run the `pnpm rebuild` line above
after a `dist:*` run before going back to tests / `pnpm dev`).

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

Praxis pulls in three native modules that need a C++ toolchain at install time:

| Module | Used by | Notes |
|---|---|---|
| `better-sqlite3` | core, tools | Rebuilt for Electron via `pnpm --filter @praxis/desktop rebuild:electron`; rebuilt for Node via `pnpm rebuild better-sqlite3` |
| `canvas` | tools (PDF page rendering) | Same dual-rebuild story as better-sqlite3 |
| `isolated-vm` | tools (JS sandbox) | Currently uncovered for Electron 41's V8. Resolves and works under Node, but the `.node` binding won't load in the packaged desktop app — sandbox features are non-functional in `pnpm dev` / `pnpm dist:*` until [upstream releases a fix](https://github.com/laverdet/isolated-vm). Builds and tests outside Electron still work. |

If `pnpm install` fails with a `node-gyp` error, install Xcode Command Line
Tools (macOS) or build-essential (Linux). On macOS Apple Silicon, also ensure
you have Python 3 on PATH.

## Package layout

| Package | Description |
|---|---|
| `@praxis/core` | Orchestrator — DB module, shared types, service composition |
| `@praxis/engines` | LLM engine adapters (Anthropic, OpenAI, Codex, Ollama) |
| `@praxis/memory` | Episodic + semantic memory, student-model projections |
| `@praxis/artifacts` | Courses, lessons, assignments, notes, flashcards |
| `@praxis/tools` | Deterministic and grounded tool implementations |
| `@praxis/curriculum` | Concept graphs, prerequisite edges, pedagogy packs |
| `@praxis/client` | RPC client types and transport layer |
| `@praxis/ui` | React component library for the tutor UI |
| `@praxis/claude-cli-sdk` | Vendored fork of `@nklisch/claude-cli-sdk` — TypeScript wrapper around the Claude Code CLI subprocess. Vendored locally so `pnpm deploy` doesn't choke on the upstream `link:` path |
| `@praxis/desktop` | Electron entry point — mounts core + UI |

## Development scripts

| Script | What it does |
|---|---|
| `pnpm build` | Compile all packages via TypeScript project references |
| `pnpm typecheck` | Type-check all packages (uses `tsgo`, the TS native compiler) |
| `pnpm test` | Run Vitest suite across all packages |
| `pnpm lint` | Biome check (lint + format verify) |
| `pnpm lint:fix` | Biome check with auto-fix applied |
| `pnpm db:migrate` | Apply pending Drizzle migrations to `.praxis/dev.db` |
| `pnpm db:generate` | Generate migration SQL from schema changes |
| `pnpm db:show` | Print all tables and row counts |
| `pnpm db:reset` | Delete dev DB and re-migrate from scratch |
| `pnpm dev` | Run the Electron desktop app in dev mode (requires `rebuild:electron` first) |
| `pnpm desktop:build` | Build the Electron bundle (unpackaged) into `packages/desktop/out/` |
| `pnpm --filter @praxis/desktop rebuild:electron` | Rebuild native modules against Electron's Node ABI |
| `pnpm --filter @praxis/desktop dist:dir` | Build unpacked Electron app directory (fast, no installer) |
| `pnpm --filter @praxis/desktop dist:mac` | Build macOS `.dmg` + `.zip` |
| `pnpm --filter @praxis/desktop dist:win` | Build Windows NSIS installer |
| `pnpm --filter @praxis/desktop dist:linux` | Build Linux `.AppImage` + `.deb` |

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
- `docs/designs/` — per-phase implementation designs (phases 1–12 shipped)
- `docs/refactors/` — refactor plans (latest: post-phase-12)

For agent-facing project conventions, see `CLAUDE.md` and `.claude/skills/patterns/`.
