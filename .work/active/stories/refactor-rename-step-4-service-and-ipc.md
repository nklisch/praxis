---
id: refactor-rename-step-4-service-and-ipc
kind: story
stage: implementing
tags: [refactor, naming, ipc, db-migration]
parent: refactor-rename-bootstrap-and-explorer
depends_on: [refactor-rename-step-3-mode-id]
release_binding: null
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Step 4: Rename BootstrapService + bootstrap/ directory + IPC channels + config

## Brief

Final code-level step. Renames the service-layer infrastructure that
backs the course-create mode:

- `BootstrapServiceImpl` and the `bootstrap-service.ts` file
- `BootstrapConfig` and the `bootstrap-config.ts` file (plus the
  `config_kv` key migration from `"bootstrap"` to `"course_create"`)
- The `praxis.bootstrap.drafts.events.*` IPC channel family
- The `packages/curriculum/src/bootstrap/` directory and its subpath
  export
- UI hooks and components named after the old mode (`use-active-bootstrap-session`,
  `use-bootstrap-budget`, `bootstrap-tab-body`)

Two atomic concerns: the IPC channel rename is wire-level between main
and renderer (single-app build, so atomic at install time); the
`config_kv` key rename is a DB migration.

## Atomic-step acknowledgment

IPC channel names must agree between Electron main and renderer in the
same build. Since this is a single bundled app, install-time atomicity
holds — there's no rolling deploy. The `config_kv` migration is
forward-only; rollback uses manual SQL.

## Current State

```ts
// packages/core/src/services/bootstrap-service.ts
export class BootstrapServiceImpl implements BootstrapService {
  // ...
}

// packages/core/src/config/bootstrap-config.ts
export const BOOTSTRAP_CONFIG_KEY = "bootstrap";
export interface BootstrapConfig { /* ... */ }
export async function readBootstrapConfig(): Promise<BootstrapConfig> { /* ... */ }

// packages/desktop/electron/main/bootstrap-drafts-channel.ts
ipcMain.handle("praxis.bootstrap.drafts.events.start", /* ... */);

// packages/client/src/services/drafts-client.ts:8
streamBase: "praxis.bootstrap.drafts.events";

// packages/client/src/services/config-client.ts:81
async bootstrapConfig(): Promise<BootstrapConfigSnapshot> { /* ... */ }

// packages/curriculum/package.json
"exports": {
  "./bootstrap": { /* ... */ }
}
```

## Target State

```ts
// packages/core/src/services/course-create-service.ts
export class CourseCreateServiceImpl implements CourseCreateService {
  // ...
}

// packages/core/src/config/course-create-config.ts
export const COURSE_CREATE_CONFIG_KEY = "course_create";
export interface CourseCreateConfig { /* ... */ }
export async function readCourseCreateConfig(): Promise<CourseCreateConfig> { /* ... */ }

// packages/desktop/electron/main/course-create-drafts-channel.ts
ipcMain.handle("praxis.course_create.drafts.events.start", /* ... */);

// packages/client/src/services/drafts-client.ts
streamBase: "praxis.course_create.drafts.events";

// packages/client/src/services/config-client.ts
async courseCreateConfig(): Promise<CourseCreateConfigSnapshot> { /* ... */ }

// packages/curriculum/package.json
"exports": {
  "./course-create": { /* ... */ }
}
```

## Files

**Directory rename**:
- `packages/curriculum/src/bootstrap/` → `packages/curriculum/src/course-create/`
  (use `git mv` on the directory; verify all imports flip from
  `@praxis/curriculum/bootstrap` to `@praxis/curriculum/course-create`)

**File renames (`git mv`)**:
- `packages/core/src/services/bootstrap-service.ts` → `course-create-service.ts`
- `packages/core/src/services/__tests__/bootstrap-service*.test.ts` →
  `course-create-service*.test.ts` (all variants — durability, queries,
  draft-stream, persist-units, session-scope, units)
- `packages/core/src/config/bootstrap-config.ts` → `course-create-config.ts`
- `packages/core/src/config/__tests__/bootstrap-config.test.ts` →
  `course-create-config.test.ts`
- `packages/desktop/electron/main/bootstrap-drafts-channel.ts` →
  `course-create-drafts-channel.ts`
- `packages/ui/src/hooks/use-active-bootstrap-session.ts` →
  `use-active-course-create-session.ts`
- `packages/ui/src/hooks/__tests__/use-active-bootstrap-session.test.tsx` →
  `use-active-course-create-session.test.tsx`
- `packages/ui/src/hooks/use-bootstrap-budget.ts` →
  `use-course-create-budget.ts`
- `packages/ui/src/hooks/__tests__/use-bootstrap-budget.test.tsx` →
  `use-course-create-budget.test.tsx`
- `packages/ui/src/components/bootstrap-tab-body.tsx` →
  `course-create-tab-body.tsx`
- `packages/ui/src/components/bootstrap-tab-body.module.css` →
  `course-create-tab-body.module.css`
- `packages/ui/src/components/__tests__/bootstrap-tab-body-*.test.tsx` →
  `course-create-tab-body-*.test.tsx` (preserve sub-name suffixes)

**Symbol renames**:
- `BootstrapServiceImpl` → `CourseCreateServiceImpl`
- `BootstrapService` (port) → `CourseCreateService`
- `BootstrapServiceDeps` → `CourseCreateServiceDeps`
- `BootstrapConfig` → `CourseCreateConfig`
- `BootstrapConfigSchema` → `CourseCreateConfigSchema`
- `BootstrapConfigSnapshot` → `CourseCreateConfigSnapshot`
- `DEFAULT_BOOTSTRAP_CONFIG` → `DEFAULT_COURSE_CREATE_CONFIG`
- `BOOTSTRAP_CONFIG_KEY` → `COURSE_CREATE_CONFIG_KEY` (value also changes,
  see string rename below)
- `readBootstrapConfig` → `readCourseCreateConfig`
- `writeBootstrapConfig` → `writeCourseCreateConfig`
- `bootstrapConfig()` RPC method on `ConfigClient` → `courseCreateConfig()`

**String renames**:
- IPC channel base `"praxis.bootstrap.drafts.events"` → `"praxis.course_create.drafts.events"`
  (apply consistently across main-side `ipcMain.handle` calls and the
  renderer-side `streamBase`)
- Config-channel method name (look in `config-client.ts` for `bootstrapConfig`
  channel string) — flip to the new method name's channel
- `BOOTSTRAP_CONFIG_KEY = "bootstrap"` → `COURSE_CREATE_CONFIG_KEY = "course_create"`
  (matches the `config_kv` row key)

**Package.json exports update** (`packages/curriculum/package.json`):
- `"./bootstrap"` subpath → `"./course-create"`

**Importer updates** (every file that does `from "@praxis/curriculum/bootstrap"`):
- Verify via `grep -rln "@praxis/curriculum/bootstrap" packages/` and flip
  each to `"@praxis/curriculum/course-create"`.

**New Drizzle migration**:
File: `drizzle/<next-NNNN>_rename-bootstrap-config-key.sql`

```sql
-- Rename the config_kv row holding course-create-mode config (budget, etc.)
UPDATE config_kv SET key = 'course_create' WHERE key = 'bootstrap';
```

**Out of scope for this step**:
- Foundation docs (Step 5)
- Historical migration SQL like `drizzle/0015_tab-title-backfill.sql` — its
  comment references "bootstrap" as the old display name, but committed
  migrations represent history; we don't rewrite them
- `.work/archive/` and `.work/releases/` items with "bootstrap" in their
  ids (historical substrate records)
- `docs/designs/phase-16-bootstrap-explorer.md` (phase design doc, history)

## Implementation Notes

- Use `git mv` for directory rename so history is preserved on each file.
- After the directory rename, `pnpm build && pnpm typecheck` will surface
  every `@praxis/curriculum/bootstrap` importer as a TypeScript error —
  use that as a worklist.
- `packages/curriculum/src/index.ts` (or its barrel) may re-export from
  `./bootstrap` — flip that path.
- The `BOOTSTRAP_CONFIG_KEY` value AND the variable name change together
  in this step. The DB migration must run for the new variable to
  resolve to existing data.
- The drafts-channel and config-channel renames are wire-level; main and
  renderer must agree in the same commit.
- Patterns to consult: `ipc-channel-convention`, `per-domain-channel-module`,
  `subscriber-fanout-stream` (drafts channel uses this).

## Acceptance Criteria

- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm db:migrate` applies the config_kv migration cleanly
- [ ] `grep -rn "BootstrapService\|BootstrapConfig\|bootstrapConfig\|BOOTSTRAP_CONFIG_KEY\|readBootstrapConfig\|writeBootstrapConfig" packages/ --include="*.ts" --include="*.tsx" | grep -v dist | grep -v archive | grep -v releases` returns no results
- [ ] `grep -rln "@praxis/curriculum/bootstrap" packages/` returns no results
- [ ] `grep -rn "praxis\.bootstrap\." packages/` returns no results (the
      IPC channel string)
- [ ] `grep -rn "use-active-bootstrap-session\|use-bootstrap-budget\|bootstrap-tab-body" packages/` returns no results
- [ ] Manual smoke test (`pnpm dev`):
  - Open Praxis, click "Create a course"
  - Verify the tab body renders (CourseCreateTabBody loaded)
  - Verify the drafts stream produces events (IPC channel works)
  - Open the configurator → memory tab → verify budget config loads from
    `config_kv` after the migration

## Risk

**Medium** — file/symbol renames are caught by tsc; the wire-level
concerns (IPC, config_kv) are bounded and verifiable in smoke tests.

## Rollback

**Code**: `git revert <commit>` reverses file renames, symbol renames, and
channel-name strings.

**DB state**: the `config_kv` rename is forward-only. Manual reversal:

```sql
UPDATE config_kv SET key = 'bootstrap' WHERE key = 'course_create';
```

In production this is a one-way door; ship-forward is the rollback path.
