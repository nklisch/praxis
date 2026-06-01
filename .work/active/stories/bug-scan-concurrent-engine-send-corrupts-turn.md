---
id: bug-scan-concurrent-engine-send-corrupts-turn
kind: story
stage: done
tags: [bug, concurrency, high]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
bug_origin: scan
bug_severity: high
bug_domain: concurrency
bug_location: packages/core/src/services/session-service.ts:319
---

# Concurrent sends can reuse one EngineSession and corrupt turn routing

**Location**: `packages/core/src/services/session-service.ts:319` · **Severity**: high · **Pattern**: reentrancy and non-atomic shared session state

`turnInFlight` is set but not used to reject or serialize a second send for the same session, so two IPC starts can enter the same `EngineSession` and overwrite per-turn handlers in the Claude conversation. Add a per-session mutex or queue before calling `handle.send()`.

```ts
capturedEntry.turnInFlight = true;
try {
  for await (const event of capturedEntry.handle.send(message, signal)) {
    // ...
  }
} finally {
  capturedEntry.turnInFlight = false;
}
```

## Implementation notes

- Changed `packages/core/src/services/session-service.ts` to claim a session turn before promotion/acquire/engine send and reject a second same-session send with `session.turn_in_flight` before recording another user message.
- Also made `notifySession()` respect the same in-service claim so synthetic notice turns do not overlap a claimed user turn.
- Added `packages/core/src/services/__tests__/session-service.concurrency.test.ts` covering concurrent same-session send rejection.

## Review (2026-06-01)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Story fast lane. Verdict: Approve - story verified by implement; fast-lane advance. Full integration verification also passed with `TMPDIR=$PWD/.tmp pnpm test` (489 files, 5439 tests) and targeted Biome on the touched-code set.
