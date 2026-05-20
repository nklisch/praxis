# Style Rule: no-temporal-comments

> Code comments describe what the code IS right now, not when it arrived,
> what it used to be, or which phase added it. If a comment would need
> rewriting after a rename, refactor, or version bump, it's temporal —
> remove or rewrite it.

## Motivation

Praxis evolves in numbered phases and rolls schemas forward
continuously. Comments anchored to that history (`Phase 16:`, `renamed
from X in Phase 17`, `for backward compat with old configs`) decay into
noise once the reader has no idea what "Phase 16" was — and they invite
cargo-culting. The current state of a column, type, or function is the
truth; history belongs in `git log`, `CHANGELOG.md`, `docs/designs/`,
and substrate items.

## What Counts as Temporal

1. **Phase / milestone tags** — `Phase 16:`, `// ─── Phase 16: ... ───`,
   `M1`, `v1.16`, `sprint 7`.
2. **Recency / tense markers** — `recently added`, `newly added`,
   `currently we...`, `now we...`, `previously...`, `used to be...`,
   `was previously exported from...`.
3. **Rename / move provenance** — `renamed from X`, `moved from Y/`,
   `replaces Z`, `formerly known as`.
4. **Backward-compat narrative** — `for backward compat with old configs`,
   `legacy drafts`, `kept for old callers`, `remove after migration`.
   Documenting the **current behavior** of a backward-compat branch is
   fine; narrating **why historically** is not.

## Before / After

### From this codebase: schema field with phase tag

**Before** — `packages/artifacts/src/schema.ts:16-21`
```ts
/**
 * Phase 16: serialized AssessmentPlan. Null for courses created
 * before Phase 16. Written by persistDraft when the drafter produces a
 * plan; immutable after that except through configure-mode tooling.
 */
assessmentPlanJson: text("assessment_plan_json", { mode: "json" }),
```

**After**
```ts
/**
 * Serialized AssessmentPlan; nullable for courses without one.
 * Written by persistDraft; immutable after that except through
 * configure-mode tooling.
 */
assessmentPlanJson: text("assessment_plan_json", { mode: "json" }),
```

### From this codebase: section header

**Before** — `packages/artifacts/src/schema.ts:80`
```ts
// ─── Phase 16: Course units + assessment plan ─────────────────────────────────
```

**After**
```ts
// ─── Course units + assessment plan ───────────────────────────────────────────
```

### From this codebase: discriminator with rename history

**Before** — `packages/core/src/services/assignment-service.ts:78`
```ts
// single-choice (renamed from multiple-choice in Phase 17)
BaseItem.merge(WithReasoning)
  .extend({ kind: z.literal("single-choice"), ... }),
```

**After** — delete the comment. The discriminator literal is the
documentation; readers don't need the prior name.

### From this codebase: backward-compat narrative

**Before** — `packages/core/src/services/session/engine-session-manager.ts:385-389`
```ts
// Phase 4: filter toolDefinitions by mode.toolNames.
const enabledNames = new Set(args.mode.toolNames);
const enabledTools =
  enabledNames.size === 0
    ? this.deps.toolDefinitions // empty array means "all available" for backward compat
    : this.deps.toolDefinitions.filter((t) => enabledNames.has(t.name));
```

**After**
```ts
const enabledNames = new Set(args.mode.toolNames);
const enabledTools =
  enabledNames.size === 0
    ? this.deps.toolDefinitions // empty toolNames = all tools available
    : this.deps.toolDefinitions.filter((t) => enabledNames.has(t.name));
```

The current-state explanation stays; the `Phase 4` header and `for
backward compat` framing go.

### Synthetic example: stale TODO with milestone

**Before:** `// TODO(sprint-7): switch to streaming once the new transport ships`
**After:** `// TODO: stream sessions once the transport supports it` — or delete.

## Exceptions

Keep when the temporal/historical detail is **load-bearing for current
correctness** and has no better home:

- **External constraints pinned to a date.** `// Discontinued 2026-03-26
  by upstream — DO NOT re-add` (see `packages/core/src/config/vision-models.ts:49`)
  — the date pins *why we won't re-add it*, not trivia.
- **`@deprecated use X instead`** JSDoc on still-supported APIs.
- **Migration code that operates on old data** — comments referencing
  source schema versions are about what the code touches *right now*.

## Scope

- **Applies to**: All TS/TSX source in `packages/*/src/` and `apps/*/src/`,
  including JSDoc on exported types. Section-divider comments
  (`// ─── ... ───`) included.
- **Does NOT apply to**:
  - `docs/`, `docs/designs/`, `docs/refactors/`, `.work/`, `.mockups/`,
    `.claude/`, `.agents/` — these are *meant* to carry history.
  - `drizzle/` and `drizzle/meta/` — migrations are inherently versioned.
  - `CHANGELOG.md`, `README.md`, ADR-style files.
  - Test descriptions / `it("legacy flow still works")` — test names can
    name the historical scenario being guarded.

## Detection

Ripgrep patterns (run from repo root, scoped to source):

```bash
rg -n --type ts -g '!**/dist/**' -g 'packages/*/src/**' -g 'apps/*/src/**' \
  -e 'Phase\s+\d+' \
  -e '\b(previously|formerly|used to be|recently added|newly added)\b' \
  -e '\brenamed from\b' -e '\bmoved from\b' -e '\breplaces\b' \
  -e 'backward[- ]compat' -e '\blegacy\b'
```

Filter against **Scope** and **Exceptions**; expect noise from test
description strings — skip them. For each High Value entry: cite
`file:line`, quote the comment, provide the **exact replacement text**
(or `delete`), and grep for the literal `"Phase N"` as a string in case
production code keys off it.
