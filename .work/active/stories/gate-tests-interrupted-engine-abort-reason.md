---
id: gate-tests-interrupted-engine-abort-reason
kind: story
stage: drafting
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: tests
created: 2026-05-12
updated: 2026-05-12
---

# `interrupted` event with `reason: "engine_abort"` is not exercised anywhere

## Priority
Medium

## Spec reference
Item: `epic-bootstrap-readiness-in-flight-affordances` (Unit 1)
Acceptance criterion: `EngineEvent` type extends with `{ type: "interrupted"; reason: "user_cancel" | "engine_abort" }`. `"engine_abort"` is documented in `packages/core/src/types/engine.ts:233` as "adapter-level abort without a client-side signal." Existing tests only exercise the `"user_cancel"` path.

## Gap type
Missing test for valid partition (the second case of the discriminated reason field)

## Suggested test
```ts
// packages/ui/src/__tests__/use-streamed-send.test.tsx OR
// packages/ui/src/hooks/__tests__/episodic-to-messages.test.ts
it("renders cancel-marker for interrupted event with reason 'engine_abort'", async () => {
  // Stream emits { type: "interrupted", reason: "engine_abort" } directly (no signal).
  // Assert the UI surfaces it as a cancel-marker (same as user_cancel) — OR — if a
  // distinct treatment is intended, lock that treatment here.
});
```

## Test location (suggested)
`packages/ui/src/__tests__/use-streamed-send.test.tsx`
