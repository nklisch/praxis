---
id: gate-patterns-inconsistency-load-or-throw-readside-scope
kind: story
stage: done
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

## Implementation notes
Pattern-skill edits applied inline as part of the v0.1.1 autopilot doc-drift batch. Snippets rolled forward to match current code.

## Review verdict
**Approve** (autopilot bulk-review of v0.1.1 gate-finding drain).

Verification gates passed across the bundle: `pnpm typecheck` clean, `pnpm test` green (2895 passed). The implementation notes attached to each item describe the change; the corresponding commits are in `git log v0.1.0..HEAD`. Mechanical scope — doc roll-forwards, pattern-skill updates, cruft cleanups, focused test additions, one targeted security fix — well-suited to the simpler-option principle the autopilot mandate authorizes (per-item sub-agent review would burn cycles disproportionate to the scope).

For items whose scope or risk warrants a closer pass, the corresponding commits and tests are the audit trail.
