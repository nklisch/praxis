---
id: refactor-rename-bootstrap-and-explorer
kind: feature
stage: done
tags: [refactor, naming, curriculum, tools]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Refactor: rename bootstrap + explorer to course-create + drafter

## Brief

Internal CS jargon ("bootstrap", "explorer") has been bleeding through to
student- and configurator-facing UI surfaces. UI mocks have been retrofitted
to use **"Create a course"** (replacing "bootstrap") and to **drop the named
agent entirely** — framing the work ("Praxis is drafting", "the draft is
taking shape") instead of personifying an internal agent ("the explorer is
exploring"). Backend code, tool names, mode ids, prompt files, and foundation
docs need to be aligned with the new naming so the UI surface stays
consistent and future refactors don't reintroduce the bleed.

This is a cross-package rename — not a behavioral change. The architecture
stays the same; the labels change. Foundation docs (CURRICULUM.md,
ARCHITECTURE.md, SPEC.md, VISION.md) get rolled forward in place during
the refactor, never with "previously named bootstrap" prose. Tool name
changes are a wire-level break, so this needs a careful sweep — handlers,
schemas, tests, MCP bridge bindings, and any episodic events that reference
the old names.

## Surface area (initial sweep)

- **Mode id** `bootstrap` → `course_create` (or reconsider whether this is a
  session mode at all — it may be better modeled as an authoring action)
- **Agent class** `Explorer` / `ExplorerAgent` → `Drafter`, or remove the
  named agent abstraction entirely if it's a thin wrapper
- **Tool** `course.start_exploration` → `course.start_drafting`; consider
  whether `course.draft_*` tool family already matches the new naming
- **Prompt files** `bootstrap/explorer-prompt.ts` → `course-create/drafter-prompt.ts`
- **Service / type names** any `Bootstrap*` / `Explorer*` symbols in
  `@praxis/core`, `@praxis/tools`, `@praxis/curriculum`
- **Foundation docs** sections in `docs/CURRICULUM.md`, `docs/ARCHITECTURE.md`,
  `docs/SPEC.md`, `docs/VISION.md`, `docs/UX.md` that describe the bootstrap
  explorer flow
- **Tests** any test fixture / describe-block name that uses old terms
- **UI** any remaining lingering UI strings (mocks are already updated; this
  is the safety net to catch real-component drift)

## Out of scope

- Changing what the drafter does. This is rename-only.
- Changing the UI mocks. They already use the new naming.
- Removing the bootstrap mode if it's still architecturally distinct — this
  refactor renames; reconsidering the mode-vs-action question is a separate
  scope.

## Why a feature (not a story)

- Cross-package surface area (curriculum, tools, core/services, engines via
  prompt files, ui, docs)
- Tool name change is a wire-level concern (MCP bridge, schemas, episodic
  records that reference the tool name)
- Mode id change cascades through pedagogy packs, gates, prompt fragment
  composition, and any persisted session rows that store `mode_id`
- Foundation docs need careful in-place rolling; not a single-pass sed

## Refactor Overview

A discovery pass mapped ~200+ occurrences across ~80 files in three layers:

1. **Internal agent abstraction** — `Explorer` / `runConceptExplorer` /
   `EXPLORER_SYSTEM_PROMPT` in `packages/curriculum/src/bootstrap/`. Fully
   internal; only a handful of callers; no API contract.
2. **Tool name** — `course.start_exploration` is a wire-level identifier
   surfaced to the model and stored in episodic event rows. Atomic: all
   references must agree.
3. **Mode id + service layer** — `"bootstrap"` is a discriminator value
   stored in `sessions.mode_id`, `episodic_events.mode_id`, `tabs.mode_id`,
   `prompt_overrides.mode_id`, and `mode_prompt_appends.mode_id`. Also the
   key in `config_kv` for the per-mode budget config. Renaming requires a
   coordinated atomic switch across code AND a Drizzle migration that
   backfills existing rows.

The refactor is sliced into **5 sequential steps**, each individually
committable. Steps 3 and 4 are inherently atomic (wire / DB-format
changes); their atomicity is acknowledged in their step bodies.

Historical episodic events that reference `course.start_exploration` or
`mode_id = "bootstrap"` for already-ended sessions remain on the old names
— they're an audit record of what happened at that moment in time. The
DB migration only rewrites rows for **live** sessions (no `ended_at`), so
the historical record is preserved. New rows use the new names.

## Refactor Steps

### Step 1: Rename Explorer → Drafter (internal agent abstraction)

**Priority**: High
**Risk**: Low — fully internal; no external API; symbol rename caught by tsc.
**Files**:
- `packages/curriculum/src/bootstrap/explorer.ts` → `drafter.ts`
- `packages/curriculum/src/bootstrap/explorer-prompt.ts` → `drafter-prompt.ts`
- `packages/curriculum/src/bootstrap/__tests__/explorer.test.ts` → `drafter.test.ts`
- `packages/curriculum/src/bootstrap/index.ts` (barrel update)
- `packages/tools/src/course/start-exploration.ts` (caller — import + handler body refs)
- `packages/curriculum/src/modes/fragments/__tests__/drafter-configurator-posture.test.ts` (test assertions)
- `packages/ui/src/lib/copy.ts` (one user-facing string)
- `.mockups/flows/course-create-entry/03-explorer-running.html` → `03-drafter-running.html` (cosmetic)

**Story**: `refactor-rename-step-1-explorer-to-drafter`

**Current State**:
```ts
// packages/curriculum/src/bootstrap/explorer.ts
import { EXPLORER_SYSTEM_PROMPT } from "./explorer-prompt.js";
export interface RunConceptExplorerInput { ... }
export interface RunConceptExplorerResult { ... }
export async function runConceptExplorer(input): Promise<RunConceptExplorerResult> {
  const log = baseLog.child({ component: "explorer" });
  // log.info("explorer.start", { ... });
  ...
}
```

**Target State**:
```ts
// packages/curriculum/src/bootstrap/drafter.ts
import { DRAFTER_SYSTEM_PROMPT } from "./drafter-prompt.js";
export interface RunConceptDrafterInput { ... }
export interface RunConceptDrafterResult { ... }
export async function runConceptDrafter(input): Promise<RunConceptDrafterResult> {
  const log = baseLog.child({ component: "drafter" });
  // log.info("drafter.start", { ... });
  ...
}
```

**Implementation Notes**:
- Use `git mv` for file renames so history is preserved.
- Rename symbols with the Edit tool's `replace_all` per file — Explorer / EXPLORER → Drafter / DRAFTER for code, but be precise about NOT touching the word "explore" in unrelated prose ("explore the catalogue" stays).
- Log-key strings (`"explorer.*"` → `"drafter.*"`) are part of this — they're observability surfaces but not wire-protocol; old logs in flight are fine to drop because they're per-process.
- Keep the `bootstrap/` directory name AS-IS in this step; the directory rename happens in Step 4 alongside the service rename.

**Acceptance Criteria**:
- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `grep -rn "Explorer\|runConceptExplorer\|EXPLORER_" packages/ | grep -v dist | grep -v .test` returns no results
- [ ] `grep -rn "explorer\." packages/curriculum/src/bootstrap/` returns no log-key matches

**Rollback**: `git revert <commit>` cleanly reverts file renames and symbol changes.

---

### Step 2: Rename tool `course.start_exploration` → `course.start_drafting`

**Priority**: High
**Risk**: Medium — atomic at the wire level. The model's prompt references the tool name; mode `toolNames` lists must agree.
**Files**:
- `packages/tools/src/course/start-exploration.ts` → `start-drafting.ts`
- `packages/tools/src/course/__tests__/start-exploration.test.ts` → `start-drafting.test.ts`
- `packages/tools/src/labels/index.ts` (label entry keyed by tool name)
- `packages/curriculum/src/modes/bootstrap.ts` (toolNames list — still named bootstrap.ts at this point)
- `packages/curriculum/src/modes/configure.ts` (toolNames list — configure mode also references this tool)
- `packages/curriculum/src/modes/fragments/bootstrap-role.ts` (prompt fragment referencing tool name in instructions)
- `packages/curriculum/src/modes/fragments/bootstrap-tools.ts` (tool roster)
- `packages/curriculum/src/modes/fragments/configure-tools.ts`
- `packages/curriculum/src/modes/fragments/__tests__/drafter-configurator-posture.test.ts`
- `packages/curriculum/src/modes/fragments/__tests__/bootstrap-no-inline-outline.test.ts`
- `packages/curriculum/src/modes/__tests__/bootstrap-toolnames.test.ts`
- `packages/desktop/electron/main/services.ts` (import + tool registry composition)

**Story**: `refactor-rename-step-2-tool-rename`
**Depends on**: `refactor-rename-step-1-explorer-to-drafter` (file ordering — Step 1 already touches `start-exploration.ts`)

**Current State**:
```ts
// packages/tools/src/course/start-exploration.ts
export const startExplorationTool: ToolDefinition<...> = {
  name: "course.start_exploration",
  description: "Run the concept-explorer agent on the selected source documents to build a course draft. ...",
  ...
};
```

```ts
// packages/curriculum/src/modes/bootstrap.ts
toolNames: [
  ...
  "course.start_exploration",
  ...
],
```

**Target State**:
```ts
// packages/tools/src/course/start-drafting.ts
export const startDraftingTool: ToolDefinition<...> = {
  name: "course.start_drafting",
  description: "Run the drafter on the selected source documents to build a course draft. ...",
  ...
};
```

```ts
// packages/curriculum/src/modes/bootstrap.ts
toolNames: [
  ...
  "course.start_drafting",
  ...
],
```

**Implementation Notes**:
- Atomic step: every reference to the tool name string must flip in the same commit. Pre-existing episodic events in DB keep the old name in their `eventJson.tool_name` — that's the historical record.
- Description text gets a light prose update ("concept-explorer agent" → "drafter") since it's the model-facing description.
- Update all assertion strings in the cited tests that match `course.start_exploration` exactly.

**Acceptance Criteria**:
- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `grep -rn "start_exploration\|startExploration" packages/ --include="*.ts" --include="*.tsx" | grep -v dist` returns no results
- [ ] `grep -rn "course\.start_drafting" packages/curriculum/src/modes/` returns matches in `bootstrap.ts` and `configure.ts`

**Rollback**: `git revert <commit>` — atomic across code; no DB rows depend on this string.

---

### Step 3: Rename mode id `bootstrap` → `course_create` (with DB migration)

**Priority**: Critical
**Risk**: High — wire-format break and DB migration. All `mode.id === "bootstrap"` checks must flip atomically with the migration that rewrites stored `mode_id` values.
**Files**:
- `packages/curriculum/src/modes/bootstrap.ts` → `course-create.ts` (file rename + `id: "bootstrap"` → `id: "course_create"`)
- `packages/curriculum/src/modes/fragments/bootstrap-role.ts` → `course-create-role.ts`
- `packages/curriculum/src/modes/fragments/bootstrap-tools.ts` → `course-create-tools.ts`
- Symbol renames: `bootstrapMode` → `courseCreateMode`, `bootstrapRoleFragment` → `courseCreateRoleFragment`, `bootstrapToolsFragment` → `courseCreateToolsFragment`
- All `"bootstrap"` mode-id literals across UI / core / tests:
  - `packages/core/src/services/tabs-service.ts:39`
  - `packages/ui/src/hooks/use-active-bootstrap-session.ts` (also gets renamed in Step 4)
  - `packages/ui/src/hooks/use-derived-scope.ts:89`
  - `packages/ui/src/components/chat-tab-body.tsx:529` (case dispatch)
  - `packages/ui/src/routes/{courses,library,course-create}.tsx`
  - `packages/ui/src/components/onboarding-flow.tsx:345`
  - All `__tests__` files passing `modeId: "bootstrap"`
- `packages/core/src/types/document-scopes.ts:12` — `DocumentScopeSource` union: `"bootstrap"` → `"course_create"`
- `packages/artifacts/src/schema.ts:279` — `source` text enum
- `packages/core/src/services/bootstrap-service.ts:571,587` — `source: "bootstrap"` writes (file renames in Step 4)
- New Drizzle migration: `drizzle/<NNNN>_rename-bootstrap-mode-to-course-create.sql`
  ```sql
  UPDATE sessions SET mode_id = 'course_create' WHERE mode_id = 'bootstrap' AND ended_at IS NULL;
  UPDATE tabs SET mode_id = 'course_create' WHERE mode_id = 'bootstrap';
  UPDATE prompt_overrides SET mode_id = 'course_create' WHERE mode_id = 'bootstrap';
  UPDATE mode_prompt_appends SET mode_id = 'course_create' WHERE mode_id = 'bootstrap';
  UPDATE document_scopes SET source = 'course_create' WHERE source = 'bootstrap';
  -- Historical episodic_events.mode_id stays as 'bootstrap' — it's an audit record.
  -- Already-ended sessions also stay — they're a historical record of what
  -- mode the session ran under.
  ```

**Story**: `refactor-rename-step-3-mode-id`
**Depends on**: `refactor-rename-step-2-tool-rename`

**Current State**:
```ts
// packages/curriculum/src/modes/bootstrap.ts
export const bootstrapMode: Mode = {
  id: "bootstrap",
  ...
};

// packages/core/src/services/tabs-service.ts
if (opts.modeId === "bootstrap") return `${displayName} · new course`;

// packages/core/src/types/document-scopes.ts
export type DocumentScopeSource = "bootstrap" | "manual" | "ingestion";
```

**Target State**:
```ts
// packages/curriculum/src/modes/course-create.ts
export const courseCreateMode: Mode = {
  id: "course_create",
  ...
};

// packages/core/src/services/tabs-service.ts
if (opts.modeId === "course_create") return `${displayName} · new course`;

// packages/core/src/types/document-scopes.ts
export type DocumentScopeSource = "course_create" | "manual" | "ingestion";
```

**Implementation Notes**:
- **Atomic step** — the literal string is a wire-level discriminator. Cannot ship code that emits `"course_create"` against a DB that still has `"bootstrap"` enum rows without the migration running first.
- Migration only updates LIVE rows (no `ended_at`). Historical rows preserve the audit trail.
- The `displayName` on the mode is already "course design" — that part of the user-facing language is fine and doesn't change.
- Mode registry in `packages/curriculum/src/modes/index.ts` (or wherever modes are exported) needs the rename of the export.
- `bootstrap-service.ts` writes `source: "bootstrap"` — those literal writes change to `"course_create"` in this step; the file is renamed in Step 4.
- Use `pnpm db:reset && pnpm db:migrate` in test/dev environments to confirm the migration applies cleanly.

**Acceptance Criteria**:
- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm db:migrate` applies cleanly against a DB with pre-existing `mode_id = 'bootstrap'` rows; verify SELECT shows `course_create`
- [ ] `grep -rn '"bootstrap"' packages/ --include="*.ts" --include="*.tsx" | grep -v __tests__ | grep -v dist` returns ONLY:
  - file-name matches (which become Step 4)
  - generic-CS-sense matches inside comments
  - migration SQL (the source of truth for the rename)
- [ ] No regression in the smoke test: open a course-create session, observe the tab title renders correctly.

**Rollback**: `git revert <commit>` reverses code changes. The DB migration is forward-only — to roll back DB state, manually run `UPDATE … SET mode_id = 'bootstrap' WHERE mode_id = 'course_create'` (note: also reverses the document_scopes.source backfill). Document this in the story body.

**Atomic-step acknowledgment**: this step's DB migration is **not reversible by code-only revert**. If the migration runs and the code is reverted, the DB will contain `course_create` values that the old code's `=== "bootstrap"` checks won't match. Treat as a one-way door once merged to main.

---

### Step 4: Rename BootstrapService + bootstrap/ directory paths + IPC channels + config

**Priority**: Medium
**Risk**: Medium — file/symbol renames + IPC channel name change (wire-level between renderer and main) + one config_kv key rename.
**Files**:
- `packages/core/src/services/bootstrap-service.ts` → `course-create-service.ts`
  - Symbols: `BootstrapServiceImpl` → `CourseCreateServiceImpl`, `BootstrapService` (port) → `CourseCreateService`, `BootstrapServiceDeps` → `CourseCreateServiceDeps`
- `packages/core/src/config/bootstrap-config.ts` → `course-create-config.ts`
  - Symbols: `BOOTSTRAP_CONFIG_KEY = "bootstrap"` → `COURSE_CREATE_CONFIG_KEY = "course_create"`, `BootstrapConfig` → `CourseCreateConfig`, `readBootstrapConfig()` → `readCourseCreateConfig()`, etc.
- `packages/desktop/electron/main/bootstrap-drafts-channel.ts` → `course-create-drafts-channel.ts`
  - Channel names: `"praxis.bootstrap.drafts.events.start"` → `"praxis.course_create.drafts.events.start"`, etc.
- `packages/client/src/services/drafts-client.ts` — `streamBase: "praxis.bootstrap.drafts.events"` → `"praxis.course_create.drafts.events"`
- `packages/client/src/services/config-client.ts:81` — RPC method `bootstrapConfig()` → `courseCreateConfig()`; channel name update
- `packages/ui/src/hooks/use-active-bootstrap-session.ts` → `use-active-course-create-session.ts`
- `packages/ui/src/hooks/use-bootstrap-budget.ts` → `use-course-create-budget.ts`
- `packages/ui/src/components/bootstrap-tab-body.tsx` → `course-create-tab-body.tsx`
- `packages/ui/src/components/bootstrap-tab-body.module.css` → `course-create-tab-body.module.css`
- `packages/curriculum/src/bootstrap/` directory → `packages/curriculum/src/course-create/`
- `packages/curriculum/package.json` `exports` map: `"./bootstrap"` subpath → `"./course-create"`
- All importers of `@praxis/curriculum/bootstrap` flip to `@praxis/curriculum/course-create`
- New Drizzle migration: `drizzle/<NNNN+1>_rename-bootstrap-config-key.sql`
  ```sql
  UPDATE config_kv SET key = 'course_create' WHERE key = 'bootstrap';
  ```
- Migration SQL `drizzle/0015_tab-title-backfill.sql` references the old display string in a comment — that's historical migration history, NOT rewritten (rolling-forward applies to live docs, not committed migrations).

**Story**: `refactor-rename-step-4-service-and-ipc`
**Depends on**: `refactor-rename-step-3-mode-id`

**Current State**:
```ts
// packages/client/src/services/drafts-client.ts
export class DraftsClient {
  private streamBase = "praxis.bootstrap.drafts.events";
  ...
}

// packages/desktop/electron/main/bootstrap-drafts-channel.ts
ipcMain.handle("praxis.bootstrap.drafts.events.start", ...);
```

**Target State**:
```ts
// packages/client/src/services/drafts-client.ts
export class DraftsClient {
  private streamBase = "praxis.course_create.drafts.events";
  ...
}

// packages/desktop/electron/main/course-create-drafts-channel.ts
ipcMain.handle("praxis.course_create.drafts.events.start", ...);
```

**Implementation Notes**:
- Update package.json `exports` map AND any `import` paths that reference `@praxis/curriculum/bootstrap`.
- The IPC channel rename is wire-level — main and renderer must agree in the same commit.
- `config_kv` key rename via Drizzle migration; the row's value (`BOOTSTRAP_CONFIG_KEY = "bootstrap"`) becomes `"course_create"`.
- After this step, the only remaining "bootstrap" references should be in:
  - Historical migration SQL (`drizzle/0015_…sql`)
  - Generic CS prose ("bootstrap a process", electron `bootstrap()` lifecycle fn)
  - Historical work items in `.work/archive/` and `.work/releases/` (substrate history)
  - Foundation docs (Step 5)
- Use the patterns skill index — `ipc-channel-convention` confirms the `praxis.{domain}.{action}` shape; we're swapping the `{domain}` component.

**Acceptance Criteria**:
- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm db:migrate` applies the config_kv key rename cleanly
- [ ] Renderer can call `client.config.courseCreateConfig()` and receive the prior config snapshot
- [ ] DraftsClient `events()` opens a stream against the renamed channel and receives `snapshot` event without error (smoke test against `pnpm dev`)
- [ ] `grep -rn "BootstrapService\|BootstrapConfig\|bootstrapConfig\|use-active-bootstrap-session\|use-bootstrap-budget\|bootstrap-tab-body" packages/ | grep -v dist | grep -v archive | grep -v releases` returns no results

**Rollback**: `git revert <commit>` reverses code. The `config_kv` migration is forward-only — manual `UPDATE config_kv SET key='bootstrap' WHERE key='course_create'` to reverse.

**Atomic-step acknowledgment**: IPC channel rename is wire-level. Cannot deploy main + renderer separately. Single-app build, so this is automatically atomic at install time.

---

### Step 5: Roll foundation docs forward

**Priority**: Medium
**Risk**: Low — documentation only, no code.
**Files**:
- `docs/VISION.md` (1 occurrence)
- `docs/SPEC.md` (1 occurrence)
- `docs/ARCHITECTURE.md` (~8 occurrences)
- `docs/CURRICULUM.md` (~9 occurrences)
- `docs/UX.md` (~8 occurrences)
- `docs/ROADMAP.md` (~17 occurrences — Phase 6 and Phase 16a sections especially)
- `docs/ONBOARDING.md` (~4 occurrences)
- `docs/CONTRACT.md` (~15 occurrences — type definitions and tool descriptions)
- `docs/v1-ship-checklist.md` (1 occurrence)
- `CLAUDE.md` (1 inline reference to "Bootstrap explorer tools")

**Story**: `refactor-rename-step-5-foundation-docs`
**Depends on**: `refactor-rename-step-4-service-and-ipc`

**Current State**: Foundation docs reference "bootstrap mode", "bootstrap session", "bootstrap explorer", "the explorer agent", and `course.start_exploration` as the canonical names for the concepts.

**Target State**: Foundation docs use "course-create mode" / "course-create session" / "the drafter" / `course.start_drafting`. Generic-CS uses of "bootstrap" (e.g., "session bootstrap" in the initialization-sense) get rewritten to clearer wording where the surrounding context is otherwise ambiguous.

**Implementation Notes**:
- **Rolling-forward principle** — never add "previously called bootstrap" prose. Git carries history.
- Historical design docs like `docs/designs/phase-16-bootstrap-explorer.md` are **not** foundation docs and stay as-is (history of the design at that phase).
- `docs/designs/` and `docs/refactors/` directories are out of scope.
- For each occurrence, distinguish:
  - **A (Direct rename)** — the named entity. Rewrite.
  - **B (Generic CS usage)** — "bootstrap a process", "exploration of materials". Rewrite only when clarity demands it, otherwise leave.
- Spot-check each updated doc for narrative consistency (e.g., if a paragraph refers to the drafter, prior context shouldn't still call it the explorer).

**Acceptance Criteria**:
- [ ] All Category A occurrences from the discovery inventory are rewritten
- [ ] `grep -in "bootstrap explorer\|bootstrap mode\|bootstrap session\|the explorer" docs/*.md` returns no results outside `docs/designs/` and `docs/refactors/`
- [ ] No "previously" / "originally" / "formerly" prose added (run `grep -in "previously\|originally\|formerly\|used to be called" docs/*.md` and verify no new occurrences against `git log -p`)
- [ ] CLAUDE.md "Bootstrap explorer tools" section updated to new naming

**Rollback**: `git revert <commit>` — doc-only, no consequences.

---

## Implementation Order

1. **Step 1** → `refactor-rename-step-1-explorer-to-drafter` (no deps)
2. **Step 2** → `refactor-rename-step-2-tool-rename` (depends on 1)
3. **Step 3** → `refactor-rename-step-3-mode-id` (depends on 2) ← **atomic, wire-level + DB migration**
4. **Step 4** → `refactor-rename-step-4-service-and-ipc` (depends on 3) ← **atomic, IPC + config migration**
5. **Step 5** → `refactor-rename-step-5-foundation-docs` (depends on 4)

Steps run sequentially. Step 3 and Step 4 are atomic; their atomicity is
acknowledged in their bodies. The linear chain reflects file-overlap
dependencies — earlier steps touch files that later steps rename.

## Out of scope for this refactor (deferred follow-ups)

- Reconsidering whether course-create should be a session **mode** or
  re-modeled as an authoring **action** outside the mode framework. The
  brief flags this as a parallel question; resolving it is a separate
  scope.
- Removing the `Drafter` named-agent abstraction entirely (replacing it
  with framing-only language internally). Out of scope; if desired, scope
  a follow-up.
- Renaming `.work/archive/` and `.work/releases/` items that contain
  "bootstrap" in their ids. Historical substrate records.
- Renaming `docs/designs/phase-16-bootstrap-explorer.md`. Historical phase
  design doc.

## Implementation Run Summary

All 5 child stories implemented and advanced to `stage: review`. Total of
5 implementation commits plus 1 follow-up typecheck fix on `course-create.tsx`.

| Step | Story | Commit | Notes |
|------|-------|--------|-------|
| 1 | `refactor-rename-step-1-explorer-to-drafter` | `b39a4bf` | Internal Explorer → Drafter rename: 4 file renames, 4 exported-symbol renames, 11 log keys, ~6 callers/comments updated |
| 2 | `refactor-rename-step-2-tool-rename` | `ccc28f4` | `course.start_exploration` → `course.start_drafting`: 2 file renames, `startExplorationTool` → `startDraftingTool`, ~31 files with the string flip; also fixed a latent `exactOptionalPropertyTypes` violation exposed by the rename |
| 3 | `refactor-rename-step-3-mode-id` | `7c9b2e4` | Mode-id atomic flip — `"bootstrap"` → `"course-create"` (HYPHEN, not underscore; matches `study-skills` precedent). 6 file renames, 3 symbol renames, ~60 production + ~22 test files flipped, `--tint-bootstrap` → `--tint-course-create` across 10 files, `drizzle/0023_rename-bootstrap-mode-to-course-create.sql` migration |
| 4 | `refactor-rename-step-4-service-and-ipc` | `6db4fa0` | `BootstrapService` → `CourseCreateService`, directory + IPC channel + config_kv key rename. ~93 files changed; new `drizzle/0024_rename-bootstrap-config-key.sql` migration. IPC domain uses camelCase (`praxis.courseCreate.drafts.events.*`) to match existing IPC conventions |
| 5 | `refactor-rename-step-5-foundation-docs` | `c6aebf3` | Rolled docs forward — VISION, SPEC, ARCHITECTURE, CURRICULUM, UX, ROADMAP, ONBOARDING, CONTRACT, v1-ship-checklist, CLAUDE.md, `.claude/rules/patterns.md`. Zero "previously" violations. Category-B preserved: a few CS-sense "bootstrap" usages and the actual code discriminator value `"bootstrapped"`. |

### Naming-convention decisions made during implementation

- **Mode-id storage value**: `"course-create"` (hyphen) — overrides the design's `"course_create"` to match the `study-skills` mode-id convention and the `/course-create` route path.
- **`config_kv` key value**: `"course-create"` (matches mode id).
- **IPC channel domain segment**: `courseCreate` (camelCase) — matches existing IPC conventions like `praxis.config.bootstrapConfig`.
- **TypeScript identifiers**: PascalCase types/classes (`CourseCreateService`), camelCase functions/RPC (`courseCreateConfig`), SCREAMING_SNAKE_CASE constants (`COURSE_CREATE_CONFIG_KEY`).
- **File and directory names**: kebab-case throughout.

### Cross-cutting deviations

- **Drizzle `tabs` table**: Step 3's design proposed `UPDATE tabs SET mode_id = …`, but the `tabs` table has no `mode_id` column (it joins to `sessions` for that). The migration correctly omitted that statement.
- **`client.author.bootstrap()`**: the architecture-diagram line was REMOVED rather than renamed; the method remains a placeholder that throws, and the `createCourse` placeholder is already documented.
- **Step 1 touched `start-exploration.ts`** (caller of `runConceptExplorer`) — Step 2 then renamed that file. No conflict because the file rename came strictly after Step 1's edits to it.

### Verification status

- **Typecheck**: baseline preserved (3 pre-existing `exactOptionalPropertyTypes` errors in `chat-tab-body.tsx`, `chat.tsx`, `notes-list.tsx`). Zero new errors introduced.
- **Tests**: 4481 passing, 23 skipped (slow tests behind `PRAXIS_RUN_SLOW_TESTS=1`), 0 failures.
- **Lint**: baseline preserved (524 errors, all in `.mockups/**.html` files).
- **DB migrations**: `0023` (mode_id backfill) and `0024` (config_kv key rename) both apply cleanly to scratch DB.
- **Final residual checks** (all return zero results outside `.work/`, `.mockups/`, `docs/designs/`, `docs/refactors/`, build artifacts):
  - `BootstrapService|BootstrapConfig|BOOTSTRAP_CONFIG_KEY|BootstrapTabBody|useActiveBootstrapSession|useBootstrapBudget`
  - `praxis\.bootstrap\.` (IPC)
  - `@praxis/curriculum/bootstrap` (import path)
  - `*bootstrap*` filenames in `packages/`
  - `tint-bootstrap` (CSS)
  - `start_exploration|startExplorationTool`
  - `runConceptExplorer|EXPLORER_SYSTEM_PROMPT`
  - "bootstrap mode|bootstrap session|bootstrap explorer|bootstrap agent|the explorer" in `docs/` and `CLAUDE.md`

### Out of scope (kept as-is — pre-existing, separate concerns)

- 3 pre-existing typecheck errors in UI (chat-tab-body, chat route, notes-list). Tech debt unrelated to this refactor.
- 524 pre-existing lint errors in `.mockups/**.html`. Mockup-file lint debt.
- Historical `.work/archive/`, `.work/releases/`, `docs/designs/`, migration SQL — substrate / phase history.
- The electron `bootstrap()` lifecycle function in `packages/desktop/electron/main/index.ts` (generic CS usage).


## Review (2026-05-18)

**Verdict**: Approve (epic-style aggregate review — children were reviewed individually)

**Blockers**: none
**Important**: 1 — pre-existing typecheck baseline parked as `idea-fix-exactoptional-typecheck-baseline` in the backlog. Not caused by this refactor; surfaced as adjacent tech debt during verification.
**Nits**: none

**Aggregate lens findings**:

- **Design alignment**: 5-step decomposition matched the brief's surface area. Each step's atomicity was respected (Step 3's wire+DB; Step 4's IPC+config migration). The naming-convention override (`course-create` hyphen, `courseCreate` camelCase for IPC) is documented and applied consistently across all 5 children.
- **Foundation-doc alignment**: Step 5 rolled docs forward in place. No assertion left invalidated; the docs now describe the renamed system. Zero "previously" prose violations.
- **Breaking changes (cross-cutting)**: Tool name, mode id, IPC channel, service/config/hook/component/type names — all internal to the Praxis app. No external API affected; no consumer outside the workspace depends on these names.
- **Capability completeness**: The student flow (`/course-create` → drafter explores → drafts a course shape → confirm) is behaviorally unchanged. Workspace tests (4481 passing) and the smoke-test path are intact. Users see "Create a course" / "Praxis is drafting" framing consistently from UI down through model-facing tool descriptions.

**Notes**:

Out of scope as intentionally documented in the feature body — `.work/archive/`, `.work/releases/`, `docs/designs/phase-16-bootstrap-explorer.md` retain bootstrap naming as substrate/phase history. The electron `bootstrap()` lifecycle function and a few CS-sense "bootstrap" mentions in CONTRACT.md / ARCHITECTURE.md were preserved as Category B.

The 3 pre-existing `exactOptionalPropertyTypes` errors in `chat-tab-body.tsx`, `chat.tsx`, and `notes-list.tsx` are tech debt unrelated to this refactor — parked as a backlog story for a future stride. Filing it during this review keeps the work visible without scope-creeping the rename feature.

Feature advanced `review → done`. The five child stories advanced earlier in this run. The rename refactor is complete; future code and docs work from a single course-create / drafter vocabulary.
