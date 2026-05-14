---
id: gate-cruft-session-service-stale-phase-11-12-null-shims
kind: story
stage: review
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
