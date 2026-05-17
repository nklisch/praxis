---
id: gate-security-sdk-timeout-disabled-defense-in-depth
kind: story
stage: done
tags: [security]
parent: null
depends_on: []
release_binding: null
gate_origin: security
created: 2026-05-14
updated: 2026-05-17
---

# SDK wall-clock timeout disabled without compensating watchdog when `maxSteps` is also unbounded

## Severity
Low

## Domain
Infrastructure & Deployment

## Location
- `packages/engines/src/claude-code/adapter.ts:60-70`
- `packages/engines/src/claude-code/vision.ts:46-50`

## Evidence
```ts
conv = createConversation({
  ...(modelHint !== undefined && { model: modelHint }),
  ...(openOpts.maxSteps !== undefined && { maxTurns: openOpts.maxSteps }),
  // Disable the SDK's per-turn wall-clock timeout. Praxis already bounds
  // agent turns via `maxSteps` (the real safety against runaway loops),
  timeout: 0,
```

The comment claims `maxSteps` bounds the loop, but the same lines above
only set `maxTurns` **when `openOpts.maxSteps !== undefined`**. The Praxis
SDK leaves `maxTurns` optional with no documented default, so a caller
that omits `maxSteps` gets an unbounded conversation with no wall-clock
timeout — the AbortSignal is the only fallback. Today every call site
passes a `maxSteps` (`bootstrapConfig.maxSteps`, indexer literals, grader
literals) so the case is hypothetical, but the contract is fragile.
Vision has the same shape (`maxTurns: req.images.length + 1` always set,
so vision is safe in practice).

## Remediation direction

Either (a) require `maxSteps` on `EngineOpenOptions` so the adapter
can't be called without a turn cap, or (b) set an explicit default
`maxTurns` floor in the adapter when `openOpts.maxSteps === undefined`.
Add a turn-count or per-turn dispatch-watchdog log so a stuck CLI is
observable without a wall-clock kill.

## Implementation notes

Chose option (b) — default floor in the adapter — to stay backward-compatible
and avoid a churn wave across all call sites.

### Changes

**`packages/engines/src/claude-code/adapter.ts`** (lines ~20-30, ~68-77):

- Added `DEFAULT_MAX_TURNS = 100` constant before `ClaudeCodeEngineOptions`
  with a docstring explaining the pairing with `timeout: 0`.
- Replaced the conditional spread `...(openOpts.maxSteps !== undefined && { maxTurns: openOpts.maxSteps })`
  with the always-set form `maxTurns: openOpts.maxSteps ?? DEFAULT_MAX_TURNS`.
- Updated the `timeout: 0` comment block to reflect that `maxTurns` is now
  always set (caller value or floor), making the wall-clock disablement safe
  regardless of caller discipline.

**`packages/engines/src/__tests__/claude-code.test.ts`**:

- Added two tests at the end of the describe block:
  1. `open() without maxSteps passes maxTurns: DEFAULT_MAX_TURNS (100)` — verifies
     the floor is applied when the caller omits `maxSteps`.
  2. `open() with maxSteps passes that value as maxTurns` — verifies the caller
     value is honored and the floor is not wrongly imposed.

### Default value rationale

`DEFAULT_MAX_TURNS = 100` was chosen by surveying actual call-site values:
indexers and graders pass `maxSteps: 1`; the bootstrap explorer uses `maxSteps: 30`
(or up to `200` from user config); normal tutor sessions do not cap turns at all
(the parent `SessionService` drives the conversation, not a turn budget). 100 is
generous for any normal tutor session while being far below a runaway-loop
threshold. The floor is a last-resort backstop, not a target operating point.

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Diff inspected at commit `6993cb9`.

- Correctness: `maxTurns: openOpts.maxSteps ?? DEFAULT_MAX_TURNS` matches the prior `!== undefined` guard semantically (both treat only `undefined`/`null` as fallback). Floor of 100 is justified by call-site survey in the implementation notes.
- Tests: both partitions covered (omitted `maxSteps` → floor; provided `maxSteps` → caller value passes through).
- Comment block at adapter.ts:70-80 updated to accurately describe the new invariant — no stale claim that `maxSteps` alone bounds the loop.
- Defense-in-depth is real: caller discipline is no longer a precondition for safety.
