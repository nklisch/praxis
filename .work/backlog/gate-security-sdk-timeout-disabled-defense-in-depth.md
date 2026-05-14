---
id: gate-security-sdk-timeout-disabled-defense-in-depth
kind: story
stage: backlog
tags: [security]
parent: null
depends_on: []
release_binding: null
gate_origin: security
created: 2026-05-14
updated: 2026-05-14
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
