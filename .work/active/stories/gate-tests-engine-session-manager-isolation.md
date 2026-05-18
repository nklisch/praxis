---
id: gate-tests-engine-session-manager-isolation
kind: story
stage: drafting
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
