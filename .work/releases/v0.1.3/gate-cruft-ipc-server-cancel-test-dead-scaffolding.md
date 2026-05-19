---
id: gate-cruft-ipc-server-cancel-test-dead-scaffolding
kind: story
stage: done
tags: [cleanup]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: cruft
created: 2026-05-18
updated: 2026-05-18
---

# Dead test scaffolding in `ipc-server.cancel.test.ts` left over from an earlier test approach

## Confidence
High

## Category
dead function / unused variables

## Location
`packages/desktop/electron/main/__tests__/ipc-server.cancel.test.ts:212-241`

## Evidence
```ts
let capturedSignalA: AbortSignal | undefined;
let capturedSignalB: AbortSignal | undefined;
// ...
const cancelledA = new Promise<void>((r) => { resolveA = r; });
const cancelledB = new Promise<void>((r) => { resolveB = r; });

// A single fakeSend that parks until the signal fires, capturing the signal.
async function* fakeSend(id: string, _msg: string, signal: AbortSignal): AsyncIterable<EngineEvent> {
  // ...
  if (id === streamIdA) { capturedSignalA = signal; resolveA(); }
  else { capturedSignalB = signal; resolveB(); }
}
```

Immediately followed by `trackingSend` (line 247) which superseded `fakeSend`
for the actual assertions. Biome flags all five identifiers (`capturedSignalA`,
`capturedSignalB`, `cancelledA`, `cancelledB`, `fakeSend`) as unused. The test
only uses `trackingSend` and the `signals: AbortSignal[]` array.

## Removal
Delete lines 212-241 (the leftover variables + `fakeSend` function + the
comment at line 243 which explicitly describes the discarded approach).
Re-run the test file to confirm green.

## Implementation notes (2026-05-18)

Deleted the dead block (`capturedSignalA`, `capturedSignalB`, `resolveA`,
`resolveB`, `cancelledA`, `cancelledB`, the `fakeSend` async generator, and
the companion comment) from lines 212-243. Replaced the discarded-approach
comment with a concise note explaining why `trackingSend` uses call-order
tracking. All 3 tests in the file pass. Pre-existing typecheck failure in
`session-service.ts` (unrelated `IndexerOrchestrator` type mismatch) and
biome warnings on `capturedSignal!` in the first test are not introduced by
this change.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: All 5 dead identifiers and the fakeSend function deleted. Replacement comment is accurate and concise. The retained trackingSend approach is the correct implementation. 3 tests pass.
