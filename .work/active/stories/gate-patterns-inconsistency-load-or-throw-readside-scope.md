---
id: gate-patterns-inconsistency-load-or-throw-readside-scope
kind: story
stage: drafting
tags: [refactor, documentation]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: patterns
created: 2026-05-12
updated: 2026-05-12
---

# `load-or-throw` boundary unclear — three new read-side `if (!row) throw` inline forms appeared

## Inconsistency category
existing-pattern-boundary-ambiguous

## Existing pattern
`.claude/skills/patterns/load-or-throw.md`

## Bundle code that revealed the divergence
- `packages/core/src/services/authoring-service.ts:410`
- `packages/core/src/services/bootstrap-service.ts:509`
- `packages/core/src/services/bootstrap-service.ts:535`

Three new `if (!row) throw new Error("X not found: ...")` inline forms appeared in the bundle. These are **read-side lookups** (pre-condition checks on a `get(id)` call), not post-write round-trips.

## Nature of divergence
The existing `load-or-throw` pattern is strictly scoped to post-`.insert/update/delete().run()` round-trips — verify the row exists immediately after a write. The three new inline forms are doing something different: they fail-fast on a missing row before a subsequent operation. The wording "not found" looks similar enough that future readers may interpret these as candidates for `loadOrThrow`, leading to confused codebase shapes.

Not a code-side violation — an underspecified boundary the bundle revealed.

## Resolution direction
Either:
- (a) Tighten the `load-or-throw.md` pattern doc to explicitly distinguish "post-write round-trip" (the documented case) from "general pre-condition lookup" (the new case). Add a "When NOT to Use" entry pointing read-side lookups elsewhere.
- (b) Factor a sibling `getOrThrow(load, ctx)` helper for the lookup case and migrate the three new call sites + any historical inline forms to it.

Recommend (a) — the read-side case is structurally different enough that a separate helper risks bloat. The boundary just needs explicit documentation.
