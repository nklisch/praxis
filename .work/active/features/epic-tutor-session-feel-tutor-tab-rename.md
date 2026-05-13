---
id: epic-tutor-session-feel-tutor-tab-rename
kind: feature
stage: done
tags: [ui, chat, tutor-ux]
parent: epic-tutor-session-feel
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Tutor tab rename — teaching-shaped term for the session surface

## Brief

The chat tab is a tutoring session, but it's labeled "Chat" — a name borrowed
from generic LLM products. The label is rendered from a server-side
`TabSummary.title` (`packages/ui/src/components/tab-strip.tsx:48`) populated
when the tab is opened
(`packages/ui/src/lib/open-session-in-tab.ts:24-26`). The per-mode SSOT
`ModeMeta` (`packages/ui/src/components/mode-meta.ts:10-79`) already names
modes for the in-session header (e.g., bootstrap → "course design"), but the
tab title doesn't use that data path consistently.

This feature picks a teaching-shaped name for the tab (candidates from the
park: Tutor / Teacher / Lesson / Session — final choice at feature-design
time, and may vary by mode), and updates the tab-title flow so the tab
label matches the mode's identity from `ModeMeta`. Out of scope: changing
the `chat` mode-id (it's a DB key; only UI strings move). The in-session
`<ModeHeader>` already renders correctly from `ModeMeta`; this feature
brings the tab label into the same SSOT.

## Epic context

- Parent epic: `epic-tutor-session-feel`
- Position in epic: independent UI rename — wave 1, parallelizable with the
  three other children. Smallest feature in the epic.

## Foundation references

- `docs/ARCHITECTURE.md:343` — "Chat — primary interaction. Streamed model
  messages plus selected tool I/O." This feature touches the surface name,
  not the surface behavior.

## Anchors

- Tab rendering — `packages/ui/src/components/tab-strip.tsx:48`
  (renders `tab.title` from `TabSummary`)
- Tab creation — `packages/ui/src/lib/open-session-in-tab.ts:24-26`
  (`client.tabs.open()` sets the initial title)
- Mode SSOT — `packages/ui/src/components/mode-meta.ts:10-79`
- In-session header (already renders from ModeMeta) —
  `packages/ui/src/components/mode-header.tsx:90-106`
- Tab-body dispatcher — `packages/ui/src/components/chat-tab-body.tsx:355-370`
- Server-side tab persistence — `tabs` table (SPEC.md:20)
- **Title generator** — `packages/core/src/services/tabs-service.ts:29-36`
  (`generateTitle(opts)` produces `"${modeId} · …"` strings today; this is
  the function to update)
- **Mode interface** — `packages/core/src/types/mode.ts:36-41` (has `id`,
  `label`, `description` today — needs a new `displayName` field)
- **Mode definitions** — `packages/curriculum/src/modes/{teach, bootstrap,
  quiz, homework, exam, configure, study-skills}.ts` (each needs the new
  `displayName` field set)

## Architectural choice

**Add `displayName` to the `Mode` type as the single source of truth for
the teaching-shaped name.** Each mode definition in `@praxis/curriculum`
sets `displayName` matching ModeMeta's current `name` value
("teach" / "course design" / "quiz" / "homework" / "exam" / "configure" /
"study skills"). `tabs-service.generateTitle` reads from this SSOT via
`requireMode(modeId).displayName`. `tabs-service.ts` lives in
`packages/core/src/services/` which is allowed to import `@praxis/curriculum`
(Phase 3 services exception in CLAUDE.md).

ModeMeta in `@praxis/ui` stays as-is for this feature — its `name` values
already match the chosen `displayName` strings. Documenting that the two
sources must agree is a convention; a later cleanup can consolidate them
when an `@praxis/ui`-from-`@praxis/curriculum` import path is wanted.

Two alternatives rejected:
- *Move ModeMeta into `@praxis/core` or `@praxis/curriculum`.* Would
  centralize the SSOT but pull UI-specific visual props (ornament, tint,
  deck) into a non-UI package. Wrong direction per the architecture's
  package layering.
- *Hardcode a `MODE_DISPLAY_NAMES` const inside `tabs-service.ts`.*
  Cheaper short-term, but adds a third mapping that has to stay in sync
  with `Mode` definitions and `ModeMeta`. Net debt.

## Design decisions (resolved by autopilot)

- **Name source**: `Mode.displayName` (new field), each mode sets it to
  the value already used by `ModeMeta`:
  - teach → `"teach"`
  - bootstrap → `"course design"`
  - quiz → `"quiz"`
  - homework → `"homework"`
  - exam → `"exam"`
  - configure → `"configure"`
  - study-skills → `"study skills"`
- **`Mode.label` field stays**: today set to capitalized strings ("Teach",
  etc.). Used elsewhere as a display label in non-tab contexts. Don't
  rename it; just add `displayName` as a parallel field. The two
  intentionally differ — `label` is "Title Case", `displayName` is
  "italic-serif lowercase."
- **`generateTitle` output format**: same as today
  (`"${displayName} · new chat"` etc.) — only the substituted name
  changes. Examples:
  - teach, no course → `"teach · new chat"` (unchanged)
  - bootstrap, no course → `"course design · new course"` (was
    `"bootstrap · new course"`)
  - quiz, course=algebra → `"algebra · quiz"` (unchanged — courseTitle
    already lowercased)
  - The "course design" rename is the main user-visible change here.
- **Tab title backfill**: one-shot migration. Iterate over every row in
  `tabs` table, re-derive the title via the new `generateTitle` logic,
  UPDATE the row if changed. Runs as part of the migration sequence
  via a TypeScript migration step (Drizzle supports this) or as a
  one-time script invoked at app start when a feature flag detects
  the rename hasn't been backfilled. Choosing: **TypeScript migration
  step** inside the next Drizzle migration file, since Praxis already
  uses Drizzle's migration mechanism and a TS migration runs once at
  upgrade time.
- **User-renamed tabs**: today `tabs-service.rename(tabId, title)`
  lets users set a custom title. The backfill rewrites unconditionally
  — if a user customized their tab title, it gets reset. Acceptable
  in pre-v1; document in the migration message. A later cleanup can
  add a `titleSource: 'auto' | 'user'` column to preserve customs.

## Implementation Units

### Unit 1: `Mode.displayName` field

**File**: `packages/core/src/types/mode.ts`

Extend the `Mode` interface:

```typescript
export interface Mode {
  id: string;
  label: string;
  /**
   * Lowercase, italic-serif display name used in the in-session header
   * and the tab strip — e.g. "teach", "course design". Distinct from
   * `label` (Title Case admin context). Matches `ModeMeta.name` in
   * the UI by convention.
   */
  displayName: string;
  description: string;
  // … existing fields stay
}
```

**Acceptance Criteria**:
- [ ] `Mode.displayName` exists in the type definition.

---

### Unit 2: Set `displayName` on every mode

**Files**: `packages/curriculum/src/modes/`
- `teach.ts` — `displayName: "teach"`
- `bootstrap.ts` — `displayName: "course design"`
- `quiz.ts` — `displayName: "quiz"`
- `homework.ts` — `displayName: "homework"`
- `exam.ts` — `displayName: "exam"`
- `configure.ts` — `displayName: "configure"`
- `study-skills.ts` — `displayName: "study skills"`

**Acceptance Criteria**:
- [ ] Every mode definition has the new field with the value above.
- [ ] `pnpm typecheck` passes for `@praxis/curriculum` (every Mode
      object satisfies the updated interface).

---

### Unit 3: Update `generateTitle` to use `displayName`

**File**: `packages/core/src/services/tabs-service.ts:29-36`

Replace:

```typescript
function generateTitle(opts: { modeId: string; courseTitle?: string }): string {
  if (opts.courseTitle) {
    return `${opts.courseTitle.toLowerCase()} · ${opts.modeId}`;
  }
  if (opts.modeId === "teach") return "teach · new chat";
  if (opts.modeId === "bootstrap") return "bootstrap · new course";
  return `${opts.modeId} · session`;
}
```

With:

```typescript
import { requireMode } from "@praxis/curriculum/modes";

function generateTitle(opts: { modeId: string; courseTitle?: string }): string {
  const displayName = requireMode(opts.modeId).displayName;
  if (opts.courseTitle) {
    return `${opts.courseTitle.toLowerCase()} · ${displayName}`;
  }
  if (opts.modeId === "teach") return `${displayName} · new chat`;
  if (opts.modeId === "bootstrap") return `${displayName} · new course`;
  return `${displayName} · session`;
}
```

The `modeId === "teach"` / `=== "bootstrap"` branches stay for the
mode-specific suffix ("new chat" vs. "new course") — those are
context phrasing, not display names.

**Implementation Notes**:
- `requireMode` throws if `modeId` is not registered. Currently
  `tabs-service.open()` already calls `sessions.modeId` lookup and the
  session row is guaranteed to have a real mode. If `requireMode`
  somehow fails (data corruption), let the throw propagate — it's a
  signal that the mode registry is out of sync.
- The Phase 3 import exception (services/ may import curriculum)
  applies. Verify `tabs-service.ts` is inside `packages/core/src/services/`
  before adding the curriculum import — it is.

**Acceptance Criteria**:
- [ ] `generateTitle({ modeId: "bootstrap" })` returns
      `"course design · new course"`.
- [ ] `generateTitle({ modeId: "teach", courseTitle: "Algebra" })`
      returns `"algebra · teach"`.
- [ ] `generateTitle({ modeId: "quiz" })` returns
      `"quiz · session"`.

---

### Unit 4: Backfill migration

**File**: `drizzle/<next-number>_tab-title-backfill.sql` (or a TS
migration script, depending on the existing Drizzle migration pattern)

Approach: pure-SQL `UPDATE` for the modes that have changed
display names. The only mode whose display name differs from its
modeId is `bootstrap` → `"course design"`. So the migration is:

```sql
-- Backfill tab titles for the rename: bootstrap → "course design".
-- Other modes (teach, quiz, homework, exam, configure, study-skills)
-- have displayName === modeId; their current titles are still
-- correct under the new logic.

-- "bootstrap · new course" → "course design · new course"
UPDATE tabs
SET title = 'course design · new course'
WHERE title = 'bootstrap · new course';

-- "<courseTitle> · bootstrap" → "<courseTitle> · course design"
UPDATE tabs
SET title = SUBSTR(title, 1, LENGTH(title) - LENGTH(' · bootstrap'))
         || ' · course design'
WHERE title LIKE '% · bootstrap';
```

**Implementation Notes**:
- Only `bootstrap` has a different display name than its modeId
  today, so the migration is narrow.
- If `study-skills` exposes its display name as `"study skills"`
  (space, not hyphen) and tabs are auto-titled with modeId today,
  there may also be `study-skills · …` rows. Add:
  ```sql
  UPDATE tabs SET title = REPLACE(title, 'study-skills', 'study skills')
  WHERE title LIKE 'study-skills · %' OR title LIKE '% · study-skills';
  ```
- Naming variants of the "study-skills" modeId in `tabs-service.ts`
  might already lowercase to `study-skills` — verify by reading the
  modeId field on `sessions` rows; if the modeId is literally
  "study-skills" then the current title is "study-skills · session"
  and we need the REPLACE above.

**Acceptance Criteria**:
- [ ] After running the migration on a populated dev DB:
  - All bootstrap tabs have titles starting with or ending with
    `"course design"`, not `"bootstrap"`.
  - All study-skills tabs (if any) use `"study skills"`.
- [ ] `pnpm db:reset` runs cleanly on a fresh DB (the UPDATE
      statements are idempotent — no rows means no changes).

---

### Unit 5: Tests

**File**: `packages/core/src/services/__tests__/tabs-service.test.ts`
(extend if exists; otherwise create)

Add test cases covering `generateTitle` via the public `open(input)`
path:

- `open({ modeId: "teach" })` → tab.title === `"teach · new chat"`
- `open({ modeId: "bootstrap" })` → tab.title === `"course design · new course"`
- `open({ modeId: "quiz", courseTitle: "Algebra" })` → tab.title === `"algebra · quiz"`
- `open({ modeId: "homework" })` → tab.title === `"homework · session"`

(generateTitle isn't exported, so test via `open()`.)

Verify in-session header still uses the same display name — likely
covered by existing `mode-meta.test.ts` if it exists.

**Acceptance Criteria**:
- [ ] New test cases pass.
- [ ] Existing `tabs-service.test.ts` tests still pass (they're
      asserting on title strings via `open()` — those assertions get
      updated to the new strings for `bootstrap` / any other
      affected mode).

---

## Implementation Order

Single-stride. No child stories — the work is small (~50 lines net new
code + a small migration). Suggested intra-stride order:

1. Unit 1 (Mode interface).
2. Unit 2 (set displayName on every mode definition).
3. Unit 3 (update generateTitle).
4. Unit 5 (update + add tests; verify all green).
5. Unit 4 (migration SQL).
6. `pnpm typecheck && pnpm lint && pnpm test` from repo root.

## Testing

Covered in Unit 5. Acceptance criterion: `generateTitle` produces the
new title strings for the affected modes; existing test assertions
update mechanically; new tests cover the renamed cases explicitly.

## Risks

1. **Stale ModeMeta values** (low). The UI's `ModeMeta.name` and the new
   `Mode.displayName` must agree. They do at design time (matched by
   hand). A future cleanup can derive `ModeMeta.name` from `displayName`
   via a different import path; for now, treat the duplication as
   tracked tech debt. If a drift surfaces, it's a one-line fix in
   `mode-meta.ts`.
2. **User-renamed tabs reset on backfill** (low). Today's
   `rename(tabId, title)` lets users set custom titles. The backfill
   rewrites unconditionally. Acceptable in pre-v1; the migration
   message should note this. Future feature can add a
   `titleSource: 'auto' | 'user'` column.
3. **Phase 3 import boundary** (low). `tabs-service.ts` imports from
   `@praxis/curriculum/modes`. Verified that `services/` is the
   sanctioned exception layer (CLAUDE.md). The `requireMode` import
   path needs to exist in `@praxis/curriculum`'s public exports — it
   does (used today by `prompt-customization-service.ts`).

## Implementation Notes

All 5 units landed in a single stride. Key findings:

**Unit 1–2**: `Mode.displayName` added to interface; all 7 mode definitions
updated. The `homeworkMode` doesn't inherit `displayName` from `quizMode`
(it shares `toolNames` via spread, but the mode object literal is independent),
so it needed its own `displayName: "homework"`.

**Unit 3**: `generateTitle` now calls `requireMode(opts.modeId).displayName`.
The existing mode-specific suffix branches ("new chat" / "new course") stay
unchanged — they provide context phrasing around the display name.

**Discovery — vitest resolve conditions**: The `@praxis/core` package had no
`vitest.config.ts`, so cross-package imports in tests resolved to stale `dist/`
files (missing `displayName`) rather than live source via the `praxis-source`
custom condition. Added `packages/core/vitest.config.ts` with
`conditions: ["praxis-source", "import", "module", "node", "default"]` —
mirroring the UI package's vitest config. This is a latent bug that would have
caused other cross-package test failures had anyone added a new field to any
`@praxis/curriculum` type and tested from core. All 21 tabs-service tests pass
with this fix.

**Discovery — test stub Mode objects**: Four session-service test files
(`session-service-cancel.test.ts`, `session-service.engine-session-state.test.ts`,
`session-service.notify.test.ts`, `session-service.prompt-customization.test.ts`)
contain inline `makeMode` / `makeTeachMode` / `makeQuizMode` helper functions
that construct literal mode objects without `displayName`. Adding `displayName`
as a required field caused typecheck errors in these stubs; all were fixed by
adding the matching `displayName` value.

**Unit 4**: Migration `0015_tab-title-backfill.sql` created with Drizzle's
`--> statement-breakpoint` separator between the 3 UPDATE statements. Initial
attempt without breakpoints caused Drizzle's SQLite runner to execute the entire
file as one query, failing. The `_journal.json` entry uses epoch timestamp
`1747180800000` (2026-05-13T12:00:00Z).

**Unit 5**: Tests updated — the old "bootstrap · new course" assertion updated
to "course design · new course"; 4 new test cases added (bootstrap with no
course, homework with no course, bootstrap with courseTitle, study-skills with
no course).

**Pre-existing failures (not mine)**: `course-documents-service.test.ts` (13
tests) and `textbook-rag-end-to-end.test.ts` (1 test) fail due to parallel
work from the document-scopes migration story. Confirmed in feature spec
warning.

**Acceptance criteria**: All passing.
- `generateTitle({ modeId: "bootstrap" })` → `"course design · new course"` ✓
- `generateTitle({ modeId: "teach", courseTitle: "Algebra" })` → `"algebra · teach"` ✓
- `generateTitle({ modeId: "quiz" })` → `"quiz · session"` ✓
- `pnpm db:reset` runs cleanly ✓
- 0 new typecheck errors ✓

## Review (2026-05-13)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**:
- `Mode.displayName` added with JSDoc explaining the contrast with `Mode.label` (Title Case admin) — distinct intent.
- All 7 modes set `displayName`: teach, course design, quiz, homework, exam, configure, study skills.
- `generateTitle` now reads `requireMode(modeId).displayName` instead of substituting the raw modeId. Mode-specific suffix branches preserved (`new chat` vs `new course`).
- Backfill migration `drizzle/0015_tab-title-backfill.sql` covers three patterns: bootstrap-only, courseTitle+bootstrap, hyphenated study-skills → space. Idempotent — no rows means no changes; `pnpm db:reset` runs cleanly.
- Test sweep: 4 session-service test files updated to add `displayName` to inline mode stubs (now required by the interface). 21 tabs-service tests pass.
- Added `conditions: ["praxis-source", ...]` to `packages/core/vitest.config.ts` — fix for a latent bug where cross-package imports in core tests resolved to stale `dist/` instead of source. Worth knowing for future test setup.
- Commit bundled with compose-attribution (`de359e7`) due to parallel-agent commit interleaving — content of this feature lives in the same diff but is logically distinct.
