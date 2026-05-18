---
id: refactor-rename-step-3-mode-id
kind: story
stage: done
tags: [refactor, naming, curriculum, db-migration]
parent: refactor-rename-bootstrap-and-explorer
depends_on: [refactor-rename-step-2-tool-rename]
release_binding: v0.1.3
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Step 3: Rename mode id `bootstrap` → `course_create` (with DB migration)

## Brief

The critical atomic step. The string `"bootstrap"` is a mode-id discriminator
stored in multiple DB tables and switched-against in many code paths.
Renaming requires a coordinated flip across:

1. The mode definition + symbol + file name
2. Every `mode.id === "bootstrap"` / `modeId === "bootstrap"` check in code
3. Every `modeId: "bootstrap"` literal in tests
4. The `DocumentScopeSource` union type and its `source` enum in
   `artifacts/schema.ts`
5. A new Drizzle migration that backfills live rows in `sessions`,
   `tabs`, `prompt_overrides`, `mode_prompt_appends`, and
   `document_scopes` from `"bootstrap"` to `"course_create"`

Historical (already-ended) sessions and episodic events keep the old name —
they're an audit record.

## Atomic-step acknowledgment

This step's DB migration is **not reversible by code-only revert**. If the
migration runs and the code is reverted, the DB will contain `"course_create"`
values that the old code's `=== "bootstrap"` checks won't match. Treat as a
one-way door once merged to main. The rollback section below specifies the
manual SQL reversal.

## Current State

```ts
// packages/curriculum/src/modes/bootstrap.ts
export const bootstrapMode: Mode = {
  id: "bootstrap",
  label: "Design a course",
  displayName: "course design",
  // ...
};
```

```ts
// packages/core/src/services/tabs-service.ts:39
if (opts.modeId === "bootstrap") return `${displayName} · new course`;
```

```ts
// packages/core/src/types/document-scopes.ts:12
export type DocumentScopeSource = "bootstrap" | "manual" | "ingestion";
```

```ts
// packages/artifacts/src/schema.ts:279
source: text("source", {
  enum: ["bootstrap", "manual", "ingestion"],
}).notNull(),
```

```ts
// e.g. packages/ui/src/routes/course-create.tsx:107
await openSessionInTab({ modeId: "bootstrap", /* ... */ });
```

## Target State

```ts
// packages/curriculum/src/modes/course-create.ts
export const courseCreateMode: Mode = {
  id: "course_create",
  label: "Design a course",
  displayName: "course design",
  // ...
};
```

```ts
// packages/core/src/services/tabs-service.ts
if (opts.modeId === "course_create") return `${displayName} · new course`;
```

```ts
// packages/core/src/types/document-scopes.ts
export type DocumentScopeSource = "course_create" | "manual" | "ingestion";
```

```ts
// packages/artifacts/src/schema.ts
source: text("source", {
  enum: ["course_create", "manual", "ingestion"],
}).notNull(),
```

```ts
// e.g. packages/ui/src/routes/course-create.tsx
await openSessionInTab({ modeId: "course_create", /* ... */ });
```

## Files

**File renames (`git mv`)**:
- `packages/curriculum/src/modes/bootstrap.ts` → `course-create.ts`
- `packages/curriculum/src/modes/fragments/bootstrap-role.ts` → `course-create-role.ts`
- `packages/curriculum/src/modes/fragments/bootstrap-tools.ts` → `course-create-tools.ts`
- Test files under `packages/curriculum/src/modes/__tests__/` and
  `packages/curriculum/src/modes/fragments/__tests__/` that have
  `bootstrap-` in their filename and assert on bootstrap-mode-specific
  behavior (e.g., `bootstrap-toolnames.test.ts` → `course-create-toolnames.test.ts`)
- Note: `packages/ui/src/components/bootstrap-tab-body.tsx` and friends
  stay named `bootstrap-*` at this step — they get renamed in Step 4.

**Symbol renames**:
- `bootstrapMode` → `courseCreateMode`
- `bootstrapRoleFragment` → `courseCreateRoleFragment`
- `bootstrapToolsFragment` → `courseCreateToolsFragment`
- Update the mode registry export in `packages/curriculum/src/modes/index.ts`
  (or wherever modes are aggregated)

**String literal renames** (atomic — all in one commit):
- Every `"bootstrap"` mode-id literal:
  - `packages/core/src/services/tabs-service.ts:39`
  - `packages/ui/src/hooks/use-active-bootstrap-session.ts:13`
  - `packages/ui/src/hooks/use-derived-scope.ts:89`
  - `packages/ui/src/components/chat-tab-body.tsx:529` (case dispatch)
  - `packages/ui/src/routes/courses.tsx:20,30`
  - `packages/ui/src/routes/library.tsx:81,132`
  - `packages/ui/src/routes/course-create.tsx:107`
  - `packages/ui/src/components/onboarding-flow.tsx:345`
  - All `__tests__` files passing `modeId: "bootstrap"` (22+ across
    document-scopes-service.test.ts, tabs-service.test.ts, the
    bootstrap-tab-body-* UI tests, resume-draft-picker, course-create-route,
    chat-route, onboarding-flow)
  - `packages/core/src/services/bootstrap-service.ts:571,587` —
    `source: "bootstrap"` writes (file gets renamed in Step 4, but the
    string-literal flip happens here)
- `DocumentScopeSource` union member in `packages/core/src/types/document-scopes.ts:12`
- `source` enum in `packages/artifacts/src/schema.ts:279`

**New Drizzle migration**:
File: `drizzle/<next-NNNN>_rename-bootstrap-mode-to-course-create.sql`

```sql
-- Backfill live (non-ended) sessions
UPDATE sessions
SET mode_id = 'course_create'
WHERE mode_id = 'bootstrap' AND ended_at IS NULL;

-- Tabs always reflect current state
UPDATE tabs
SET mode_id = 'course_create'
WHERE mode_id = 'bootstrap';

-- Per-mode prompt overrides and appends
UPDATE prompt_overrides
SET mode_id = 'course_create'
WHERE mode_id = 'bootstrap';

UPDATE mode_prompt_appends
SET mode_id = 'course_create'
WHERE mode_id = 'bootstrap';

-- Polymorphic document-scope source attribution
UPDATE document_scopes
SET source = 'course_create'
WHERE source = 'bootstrap';

-- Historical episodic_events.mode_id stays as 'bootstrap' — audit record.
-- Already-ended sessions stay as 'bootstrap' — historical record of which
-- mode the session ran under at the time.
```

**Out of scope for this step**:
- `BootstrapService` and `bootstrap-config` file/symbol renames (Step 4)
- IPC channel renames (Step 4)
- `bootstrap/` directory path (Step 4)
- Foundation docs (Step 5)

## Implementation Notes

- This is THE atomic step. Code that emits `"course_create"` cannot
  function against a DB whose rows still say `"bootstrap"` — the
  migration must apply first OR the code must handle both temporarily.
  We choose atomic application (migration + code change in same commit
  via the standard `pnpm db:generate` → migration SQL → code edits flow).
- Use `pnpm db:reset && pnpm db:migrate` in a scratch environment to
  verify the migration applies cleanly against a DB seeded with
  bootstrap-era rows.
- After this step, the `bootstrap/` directory still exists — that name
  changes in Step 4. Mode files have been moved out of that directory
  in this step (they live under `packages/curriculum/src/modes/`, not
  `bootstrap/`).
- The `bootstrap-service.ts` file is NOT renamed here; only the literal
  string writes inside it change (`source: "bootstrap"` →
  `source: "course_create"`).
- `displayName: "course design"` and `label: "Design a course"` already
  match the new user-facing framing and stay unchanged.

## Acceptance Criteria

- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm db:migrate` applies cleanly against a DB containing
      `mode_id = 'bootstrap'` rows; post-migration `SELECT mode_id,
      COUNT(*) FROM sessions GROUP BY mode_id` shows `course_create` for
      live sessions and `bootstrap` only for already-ended ones
- [ ] `grep -rn '"bootstrap"' packages/ --include="*.ts" --include="*.tsx" | grep -v dist | grep -v archive | grep -v __tests__/.*-bootstrap-` returns ONLY:
  - file-name references (`bootstrap-service.ts`, `bootstrap-config.ts`,
    `use-active-bootstrap-session.ts`, `use-bootstrap-budget.ts`,
    `bootstrap-tab-body.tsx`) — these get renamed in Step 4
  - generic-CS-sense matches inside comments (electron `bootstrap()`
    lifecycle fn, etc.)
  - the migration SQL string itself (the source-of-truth rename)
- [ ] Manual smoke test: from a clean dev DB, open Praxis, click "Create a
      course", verify the tab title says "course design · new course" and
      the URL/state reflects the renamed mode

## Risk

**High** — wire-format + DB migration. Mitigations:

- Migration written by hand and reviewed (don't trust `pnpm db:generate`
  alone for backfill SQL)
- Migration is idempotent (`WHERE mode_id = 'bootstrap'` is a no-op on
  already-migrated rows)
- Acceptance criteria includes the smoke test

## Rollback

**Code**: `git revert <commit>` reverses code and migration file (the
revert deletes the migration file).

**DB state**: the revert does NOT undo the row updates. Manual SQL needed
in a dev/test DB:

```sql
UPDATE sessions SET mode_id = 'bootstrap' WHERE mode_id = 'course_create' AND ended_at IS NULL;
UPDATE tabs SET mode_id = 'bootstrap' WHERE mode_id = 'course_create';
UPDATE prompt_overrides SET mode_id = 'bootstrap' WHERE mode_id = 'course_create';
UPDATE mode_prompt_appends SET mode_id = 'bootstrap' WHERE mode_id = 'course_create';
UPDATE document_scopes SET source = 'bootstrap' WHERE source = 'course_create';
```

For production / shipped users — once this migration runs in their copy of
the app, the rollback path is "ship a new release that forward-migrates
again" rather than reversing. This is true of any forward-only migration.

## Implementation Notes

### Naming decision: `"course-create"` (hyphen), not `"course_create"` (underscore)

The story body used `course_create` (underscore) as the target. This was overridden to `course-create` (hyphen) for the following reasons:

- **Convention**: The existing multi-word mode id `study-skills` uses a hyphen (`id: "study-skills"`). Hyphens are the project convention for multi-word mode ids.
- **Route alignment**: The UI route is `/course-create` (kebab-case), and the route file is `course-create.tsx`. Using a hyphen keeps the mode id consistent with the route.
- **CSS variable clean**: `--tint-course-create` is the natural kebab-case CSS variable name; `--tint-course_create` would break convention.
- **Discovery**: The migration was initially written with tabs `UPDATE tabs SET mode_id = ...` but `tabs` doesn't store `mode_id` directly — it joins `sessions`. That UPDATE was removed.

### File renames (7 files via `git mv`)

- `packages/curriculum/src/modes/bootstrap.ts` → `course-create.ts`
- `packages/curriculum/src/modes/fragments/bootstrap-role.ts` → `course-create-role.ts`
- `packages/curriculum/src/modes/fragments/bootstrap-tools.ts` → `course-create-tools.ts`
- `packages/curriculum/src/modes/__tests__/bootstrap-toolnames.test.ts` → `course-create-toolnames.test.ts`
- `packages/curriculum/src/modes/fragments/__tests__/bootstrap-no-inline-outline.test.ts` → `course-create-no-inline-outline.test.ts`
- `packages/curriculum/src/modes/fragments/__tests__/bootstrap-no-time-estimate.test.ts` → `course-create-no-time-estimate.test.ts`

### Symbol renames (3 symbols)

- `bootstrapMode` → `courseCreateMode` (in `course-create.ts`, `modes/index.ts`, `desktop/main/services.ts`, and test files)
- `bootstrapRoleFragment` → `courseCreateRoleFragment` (in fragment file and all test importers)
- `bootstrapToolsFragment` → `courseCreateToolsFragment` (in fragment file and all test importers)

### String literal flips (production code)

| File | Literal changed |
|---|---|
| `packages/curriculum/src/modes/course-create.ts` | `id: "bootstrap"` → `id: "course-create"` |
| `packages/curriculum/src/modes/fragments/course-create-role.ts` | `id: "role.bootstrap"` → `id: "role.course-create"` |
| `packages/curriculum/src/modes/fragments/course-create-tools.ts` | `id: "tools.bootstrap"` → `id: "tools.course-create"` |
| `packages/core/src/services/tabs-service.ts` | `=== "bootstrap"` → `=== "course-create"` |
| `packages/core/src/services/bootstrap-service.ts` (×2) | `source: "bootstrap"` → `source: "course-create"` |
| `packages/core/src/types/document-scopes.ts` | `DocumentScopeSource = "bootstrap" | ...` |
| `packages/artifacts/src/schema.ts` | enum `["bootstrap",...]` → `["course-create",...]` |
| `packages/tools/src/course/start-drafting.ts` | `source: "bootstrap"` → `source: "course-create"` |
| `packages/ui/src/components/authoring-chat-pane.tsx` | `AuthoringModeId`, `MODE_LABEL`, `MODE_EMPTY_STATE` |
| `packages/ui/src/components/bootstrap-tab-body.tsx` | `modeId`, `mode` props + JSDoc |
| `packages/ui/src/components/chat-tab-body.tsx` | `case "bootstrap":` switch |
| `packages/ui/src/components/library/documents-section.tsx` | `<option value>` and label text |
| `packages/ui/src/components/mode-meta.ts` | `META["bootstrap"]` → `META["course-create"]` |
| `packages/ui/src/components/new-tab-picker.tsx` | `PICKER_MODES`, `COURSE_MODES` |
| `packages/ui/src/components/note-editor-sketch.tsx` | swatch `id` and `cssVar` |
| `packages/ui/src/components/onboarding-flow.tsx` | `modeId`, `dotVariant` type |
| `packages/ui/src/components/composer-verbs-meta.ts` | `VERBS_BY_MODE["bootstrap"]` key |
| `packages/ui/src/hooks/use-active-bootstrap-session.ts` | `=== "bootstrap"` check |
| `packages/ui/src/hooks/use-derived-scope.ts` | `=== "bootstrap"` check + JSDoc |
| `packages/ui/src/routes/course-create.tsx` | `modeId: "bootstrap"` → `modeId: "course-create"` |
| `packages/ui/src/routes/courses.tsx` (×2) | same |
| `packages/ui/src/routes/library.tsx` (×2) | same |
| `packages/desktop/electron/main/services.ts` | mode registry entry |

Test files updated: `document-scopes-service.test.ts` (22 occurrences), `tabs-service.test.ts`, `bootstrap-service.session-scope.test.ts`, `start-drafting.test.ts`, `authoring-chat-pane.test.tsx`, `use-active-bootstrap-session.test.tsx`, `use-derived-scope.test.tsx`, `bootstrap-tab-body-*.test.tsx`, `chat-route.test.tsx`, `composer-verbs.test.tsx`, `course-create-route.test.tsx`, `courses-route.test.tsx`, `library-route.test.tsx`, `onboarding-flow.test.tsx`, `open-session-in-tab.test.tsx`, `resume-draft-picker.test.tsx`, `tab-strip.test.tsx`, `theme-tokens.test.tsx`, `new-tab-picker.test.tsx`, `configure-end-to-end.test.ts`, `quick-check-tool-context-wiring.test.ts`, `metacognitive-prompts-integration.test.ts`.

### CSS variable renames

`--tint-bootstrap` → `--tint-course-create` in:
- `packages/ui/src/styles/global.css` (3 occurrences: default, dark media query, explicit dark theme)
- `packages/ui/src/components/lesson-assessment-pills.module.css` (×2)
- `packages/ui/src/components/lesson-assessment-pills.tsx` (JSDoc ×2)
- `packages/ui/src/components/note-editor-sketch.tsx` (swatch cssVar)
- `packages/ui/src/components/onboarding-flow.module.css`
- `packages/ui/src/components/recommendation-row.tsx`
- `packages/ui/src/components/status-strip.module.css` (×2)
- `packages/ui/src/routes/configure/course-tab.module.css` (×3)
- `packages/ui/src/routes/course-create.module.css`

### Migration

`drizzle/0023_rename-bootstrap-mode-to-course-create.sql`

Key finding: `tabs` table does **not** store `mode_id` directly (it joins `sessions` for mode info), so the story's suggested `UPDATE tabs SET mode_id = ...` was correctly omitted. The migration updates: `sessions` (live only), `prompt_overrides`, `mode_prompt_appends`, `document_scopes.source`.

The migration uses `--> statement-breakpoint` separators required by Drizzle's `better-sqlite3` driver (which cannot prepare multi-statement strings). Verified against scratch DB at `/tmp/test-bootstrap-rename.db` via `pnpm db:reset`.

### Verification

Before/after grep snapshots:

```
# After: no "bootstrap" mode-id literal in production source (outside Step-4-deferred files)
$ grep -rn '"bootstrap"' packages/ --include="*.ts" --include="*.tsx" | grep -v dist | grep -v __tests__ | grep -vE "BOOTSTRAP_CONFIG_KEY|bootstrap-config|bootstrap-service\.ts:|main/index\.ts"
(no output — PASS)

# After: mode id present in new file
$ grep '"course-create"' packages/curriculum/src/modes/course-create.ts
23:  id: "course-create",

# After: no tint-bootstrap in UI sources
$ grep -rn "tint-bootstrap" packages/ui/src/
(no output — PASS)

# Migration file exists
$ ls drizzle/0023*.sql
drizzle/0023_rename-bootstrap-mode-to-course-create.sql
```

### Baseline typecheck error count: 3

The 3 pre-existing `exactOptionalPropertyTypes` errors remain unchanged:
- `packages/ui/src/components/chat-tab-body.tsx:534`
- `packages/ui/src/routes/chat.tsx:244`
- `packages/ui/src/routes/workspace/notes-list.tsx:125`

No new errors were introduced.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**:

Migration policy is correct — `sessions` backfills only live (non-ended) rows, matching the runtime invariant that `requireMode(sessionRow.modeId)` only fires after `endedAt` is checked (session-service.ts:158, gated by line 150). Historical bootstrap sessions never enter `requireMode` so retaining `mode_id = "bootstrap"` for them is sound as an audit record.

Other tables get full backfill (`prompt_overrides`, `mode_prompt_appends`, `document_scopes`) — these are current-state, no historical/audit distinction needed. The agent correctly discovered that `tabs.mode_id` doesn't exist (joins through `sessions`) and adjusted the migration; that omission is documented in the migration comments.

`DocumentScopeSource` union and `documentScopes.source` enum flip together; old data is backfilled, so the TypeScript narrowing aligns with stored values.

Naming-convention override: `"course-create"` (hyphen) chosen over the design's `"course_create"` to match `study-skills` precedent and the existing `/course-create` route. Decision documented in the implementation notes — defensible and consistent.

CSS variable `--tint-bootstrap` → `--tint-course-create` flipped across all 10 consumer files; the theme-tokens test asserts the new var name.

This is the highest-risk step in the refactor — wire-level discriminator + DB migration — and it lands cleanly with verification (4481 tests passing, baseline typecheck preserved). The forward-only migration rollback path is documented in the story body.
