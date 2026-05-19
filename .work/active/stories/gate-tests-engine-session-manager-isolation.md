---
id: gate-tests-engine-session-manager-isolation
kind: story
stage: review
tags: [testing, refactor]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: tests
created: 2026-05-18
updated: 2026-05-18
---

# `EngineSessionManager` has no isolation tests despite the "individually testable" criterion

## Priority
Medium

## Spec reference
Item: `refactor-session-service-extract-engine-and-episodic`

Acceptance criterion: "`EngineSessionManager` and `EpisodicEventRecorder` are
exported and individually testable" — design correction dropped
`EpisodicEventRecorder` honestly. The remaining `EngineSessionManager` is
exported at `packages/core/src/services/session/engine-session-manager.ts`,
but
`grep -rn EngineSessionManager packages/core/src/{__tests__,services/__tests__}`
returns zero hits. Coverage is transitive via
`session-service.engine-session-state.test.ts`. Edge cases (swap with a
failing close, closeAll under in-flight turns, double-acquire race) aren't
exercised.

## Gap type
missing test for declared acceptance criterion

## Suggested test
```ts
// packages/core/src/services/session/__tests__/engine-session-manager.test.ts (new)
describe("EngineSessionManager.acquire", () => {
  it("returns the existing entry when called twice with the same engineId", async () => { /* ... */ });
  it("closes the old session and opens a new one when engineId differs", async () => { /* ... */ });
  it("survives an old-session close that rejects (logs warn, opens new entry)", async () => { /* ... */ });
});
describe("EngineSessionManager.closeAll", () => {
  it("closes every active entry and clears the map", async () => { /* ... */ });
});
```

## Test location (suggested)
`packages/core/src/services/session/__tests__/engine-session-manager.test.ts` (new)

## Implementation notes (2026-05-18)

Created `packages/core/src/services/session/__tests__/engine-session-manager.test.ts` with 4 isolation tests directly exercising `EngineSessionManager`:

1. **acquire idempotence** — calling `acquire` twice with the same `sessionId`/`engineId` returns the same `ActiveEntry` reference and opens the engine exactly once.
2. **acquire swap** — calling `acquire` with a different `engineId` closes the old handle (via `closeSpy`) and returns a new entry with the new `engineId`.
3. **acquire close-failure tolerance** — when the old session's `close()` rejects, the manager logs a `"session.engine_swap.close_failed"` warn (verified via `recordingLogger`) and still opens the new entry without throwing.
4. **closeAll cleanup** — after opening 3 sessions via `openActive`, `closeAll` calls `close()` on each handle exactly once and leaves the internal map empty.

Setup details:
- Used `useTempDb()` + `openDb()` for per-test DB isolation.
- `getOrCreateDefaultStudentId` provides a properly-branded `StudentId`.
- `insertSession` helper inserts a minimal sessions row (required so `resolveResumeEngineSessionId` can query without error).
- Injected fake engine factory (`engineFactory` seam on `EngineSessionManagerDeps`) — real `EngineSessionManager` exercised, no mocking of the SUT.
- `toolServices` stub is minimal (`noopDocumentScopes` for `listForScope`; everything else `as any`) — only the document-scopes read path is hit during `openActive` without a `courseId`.

All 4 tests pass; `pnpm --filter @praxis/core typecheck` clean.
