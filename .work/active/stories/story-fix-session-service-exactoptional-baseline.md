---
id: story-fix-session-service-exactoptional-baseline
kind: story
stage: done
tags: [tech-debt, typecheck]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-19
updated: 2026-05-19
---

# Fix the 4th `exactOptionalPropertyTypes` baseline error in `session-service.ts`

## Brief
Surfaced during the review of `fix-exactoptional-typecheck-baseline` (the 3
UI-side `TS2375` errors fixed cleanly). A 4th, same-shape baseline error
remains:

```
packages/core/src/services/session-service.ts(42,51): error TS2345
  Argument of type '{ ... 5 more ...; engineFactory?: (...) => Engine; }'
  is not assignable to parameter of type 'EngineSessionManagerDeps'.
    Types of property 'indexerOrchestrator' are incompatible.
      Type 'IndexerOrchestrator | undefined' is not assignable to type 'IndexerOrchestrator'.
        Type 'undefined' is not assignable to type 'IndexerOrchestrator'.
```

Same root cause as the three already-fixed UI sites: an optional source
field flows into a destination slot typed as required (`T` not
`T | undefined`). Fix shape is also the same — conditional-spread at the
construction site, or making `indexerOrchestrator?: IndexerOrchestrator`
optional on `EngineSessionManagerDeps`.

## Decision
- If `EngineSessionManagerDeps` legitimately needs an `indexerOrchestrator`
  (i.e. it's not optional in practice) → look at the caller in
  `session-service.ts:42`, add a guard / non-null assert with a clear
  comment, or thread a real orchestrator through (preferred).
- If `EngineSessionManagerDeps` could accept undefined → mark the field
  `?:` in `EngineSessionManagerDeps` and rely on a default inside the
  manager.

## Acceptance
- `pnpm typecheck` exits clean across the workspace
- No new `as` / `!` assertions added unless they replace a stricter
  invariant elsewhere
- Story-sized — ~10-line delta

## Implementation Notes

**Fix path chosen:** Conditional-spread pattern at the construction site in `session-service.ts`.

**Why:** `EngineSessionManagerDeps` extends `Pick<ServiceDeps, ... | "indexerOrchestrator" | "activity" | "subAgent" | "promptCustomization" | ...>`. All four of these fields are optional (`?:`) on `ServiceDeps`. With `exactOptionalPropertyTypes`, explicitly passing `deps.X` (which is `T | undefined`) into an optional slot `X?: T` fails because `undefined` is not assignable to `T` — the field must either be absent or carry a concrete `T`. The fix is to conditionally spread each optional field so it's omitted (not explicitly `undefined`) when the value is absent. This exactly mirrors the pattern used in the 3 sibling fixes (f91882d).

**Files changed:**
- `packages/core/src/services/session-service.ts` — 4 lines replaced (net ±0 lines, +4 spread conditionals replacing 4 direct assignments)

**Actual diff (session-service.ts lines 45–52):**
```
- indexerOrchestrator: deps.indexerOrchestrator,
- activity: deps.activity,
- subAgent: deps.subAgent,
- promptCustomization: deps.promptCustomization,
+ ...(deps.indexerOrchestrator !== undefined && { indexerOrchestrator: deps.indexerOrchestrator }),
+ ...(deps.activity !== undefined && { activity: deps.activity }),
+ ...(deps.subAgent !== undefined && { subAgent: deps.subAgent }),
+ ...(deps.promptCustomization !== undefined && { promptCustomization: deps.promptCustomization }),
```

**Verification:**
- Typecheck before: 1 error (`TS2345` at session-service.ts:42) + 1 pre-existing error in configure-end-to-end.test.ts (root tsconfig, hidden behind the first failure)
- Typecheck after: 0 new errors from my change; per-package checks all pass; root tsconfig still has 1 pre-existing `TS2741` in configure-end-to-end.test.ts (present before this PR, was hidden by the earlier failure short-circuiting the run)
- Tests: 427 files, 4540 tests — all pass, 0 regressions
- Lint: no new errors introduced

## Review (2026-05-19)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Conditional-spread pattern is the canonical fix for `exactOptionalPropertyTypes` when an optional source field flows into an optional target slot — spreading `false` is a no-op in object spread, so the field is *absent* (not explicitly `undefined`) when the value is missing. Mirrors the 3 prior sibling UI fixes (commit f91882d). Fix surfaced one pre-existing error (`TS2741` in `tests/configure-end-to-end.test.ts:197` — missing `conceptMaps` on `AuthoringServiceDeps`) that was hidden behind this fix's short-circuit; parked as `idea-configure-end-to-end-conceptmaps-missing` rather than bundled.
