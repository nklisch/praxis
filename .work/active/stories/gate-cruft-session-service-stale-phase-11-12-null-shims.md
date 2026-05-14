---
id: gate-cruft-session-service-stale-phase-11-12-null-shims
kind: story
stage: done
tags: [cleanup]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: cruft
created: 2026-05-14
updated: 2026-05-14
---

# Stale Phase 11/12 "wired by Agent 2; null is safe until then" defensive shims in SessionService.openActive

## Confidence
High

## Category
compatibility shim (stale)

## Location
`packages/core/src/services/session-service.ts:762-773`

## Evidence
```typescript
// Phase 11: lock + authoring — propagated from toolServices when wired by Agent 2.
// biome-ignore lint/suspicious/noExplicitAny: AuthoringService wired by Agent 2; null is safe until then
lock: (this.deps.toolServices.lock as any) ?? null,
// biome-ignore lint/suspicious/noExplicitAny: AuthoringService wired by Agent 2; null is safe until then
authoring: (this.deps.toolServices.authoring as any) ?? null,
// Phase 12: notes + flashcards + fsrsScheduler.
// biome-ignore lint/suspicious/noExplicitAny: Phase 12 services; null-safe until wired
notes: (this.deps.toolServices.notes as any) ?? null,
// biome-ignore lint/suspicious/noExplicitAny: Phase 12 services; null-safe until wired
flashcards: (this.deps.toolServices.flashcards as any) ?? null,
// biome-ignore lint/suspicious/noExplicitAny: Phase 12 services; null-safe until wired
fsrsScheduler: (this.deps.toolServices.fsrsScheduler as any) ?? null,
```

`ServiceDeps.toolServices.lock` / `authoring` / `notes` / `flashcards` /
`fsrsScheduler` are all declared required, non-optional, fully typed
(see `packages/core/src/services/types.ts:48-78`). Likewise `ToolServices`
(`packages/core/src/types/tool.ts:192-201`) declares each as a
non-optional concrete service type. Phases 11 and 12 have shipped;
nothing in the codebase still passes `null` for these. The `as any`
cast + `?? null` fallback is dead defensive code, and the "wired by
Agent 2" / "Phase 12 services; null-safe until wired" comments are
stale.

## Removal
Replace lines 762-773 with the five plain field assignments
(`lock: this.deps.toolServices.lock,` etc.), drop the surrounding
`// Phase 11 …` / `// Phase 12 …` "until wired" comments, and remove
all five `biome-ignore lint/suspicious/noExplicitAny` lines. No other
surrounding cleanup needed.

## Implementation

Replaced lines 762-773 of `packages/core/src/services/session-service.ts` — the 12-line block (5 assignments × 2 lines of `as any`/`?? null` + 2 stale comments + 5 `biome-ignore` suppression lines) — with 5 plain assignments:

```typescript
lock: this.deps.toolServices.lock,
authoring: this.deps.toolServices.authoring,
notes: this.deps.toolServices.notes,
flashcards: this.deps.toolServices.flashcards,
fsrsScheduler: this.deps.toolServices.fsrsScheduler,
```

Confirmed all five fields are declared non-optional concrete service types in both `packages/core/src/services/types.ts:48-78` and `packages/core/src/types/tool.ts:192-201`. No `| null` or `?` modifier on any of them.

- `pnpm --filter @praxis/core typecheck` — passed (no errors).
- `pnpm --filter @praxis/core test` — 52 failed / 28 passed, identical count before and after the change; failures are pre-existing environment issues in `sketch-service.test.ts` and unrelated DB path tests.
- `pnpm biome check packages/core/src/services/session-service.ts` — one pre-existing formatter warning (tabs vs spaces, unrelated to this change); no orphaned biome-ignore lines.

## Review (2026-05-14)

Verdict: Approve.

**Correctness**

All five fields (`lock`, `authoring`, `notes`, `flashcards`, `fsrsScheduler`) are declared as required, non-optional concrete service types in both `ServiceDeps.toolServices` (`packages/core/src/services/types.ts:48-78`) and `ToolContext` (`packages/core/src/types/tool.ts:192-201`). No `| null` or `?` modifier on any of them. The plain assignments in the diff are type-correct and the implementer confirmed typecheck passes.

**Nullable-assumption scan**

- `grep` for `this.lock`, `this.authoring`, `this.notes`, `this.flashcards`, `this.fsrsScheduler` in `packages/core/src/` — no hits.
- Optional-chaining scan (`?.lock` etc.) across all source packages — no hits on these fields in source files.
- Tool handlers in `packages/tools/src/` access these fields directly via `ctx.services.{field}` with no null guards, consistent with the required-field contract.
- `packages/ui/src/hooks/use-lock.ts` guards `client.lock` — that is the IPC client interface, a separate layer unrelated to `ToolContext`.
- `packages/tools/src/pedagogy/__tests__/helpers.ts` stubs these fields with `null as any` with explanatory comments — this is a pre-existing test helper for pedagogy-only tests that never invoke the stubbed services. Out of scope for this story but noted; covered by existing biome-ignore justification comments.

**Design alignment**

The diff removes exactly the 12-line block specified in the story (5 assignments with `as any ?? null`, 5 `biome-ignore` lines, 2 stale phase comments), and replaces it with 5 plain assignments. No unrelated changes. Scope is correctly limited to `session-service.ts` and the story file.

**Foundation-doc alignment**

The stale "wired by Agent 2" / "null-safe until wired" comments described a future state that shipped in Phases 11 and 12. Removing them is correct; the standing contract is now expressed cleanly by the type declarations alone.
