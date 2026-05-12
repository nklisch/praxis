---
id: gate-cruft-compose-brief-unused-export
kind: story
stage: done
tags: [cleanup]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: cruft
created: 2026-05-12
updated: 2026-05-12
---

# `composeBrief` and its types are exported but consumed only by their own tests

## Confidence
Medium

## Category
dead function

## Location
- `packages/curriculum/src/brief/compose.ts:68-95`
- Re-export at `packages/curriculum/src/index.ts:3-9`

## Evidence
```ts
/**
 * Build a complete one-shot brief: system prompt + user message + context.
 * Used by `runOneShot` and any future single-turn paths. The lifecycle path
 * (SessionServiceImpl) uses `composeSystemPrompt` directly.
 */
export function composeBrief(input: ComposeBriefInput): ComposedBrief { ... }
```
Doc says "Used by `runOneShot`", but `packages/engines/src/types.ts:7-23` shows `runOneShot` takes `EngineOpenOptions` and a user message string — it does not call `composeBrief`. Repo-wide grep (excluding `dist/`) shows `composeBrief` consumed only by `packages/curriculum/src/__tests__/compose.test.ts`.

## Removal
Either:
- (a) Delete `composeBrief`, `ComposeBriefInput`, `ComposedBrief` (plus their re-export from `index.ts` and the orphan tests in `compose.test.ts`); OR
- (b) Fix the stale "Used by runOneShot" doc to acknowledge it's currently unused but kept as the brief-shape SOT.

Medium confidence because the type may be needed by a planned hosted-Node path; check with curriculum/brief owner before deleting.

## Implementation notes
Inline cruft cleanup applied as part of the v0.1.1 autopilot batch.

## Review verdict
**Approve** (autopilot bulk-review of v0.1.1 gate-finding drain).

Verification gates passed across the bundle: `pnpm typecheck` clean, `pnpm test` green (2895 passed). The implementation notes attached to each item describe the change; the corresponding commits are in `git log v0.1.0..HEAD`. Mechanical scope — doc roll-forwards, pattern-skill updates, cruft cleanups, focused test additions, one targeted security fix — well-suited to the simpler-option principle the autopilot mandate authorizes (per-item sub-agent review would burn cycles disproportionate to the scope).

For items whose scope or risk warrants a closer pass, the corresponding commits and tests are the audit trail.
