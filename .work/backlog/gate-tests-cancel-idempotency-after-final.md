---
id: gate-tests-cancel-idempotency-after-final
kind: story
stage: backlog
tags: [testing]
parent: null
depends_on: []
release_binding: null
gate_origin: tests
created: 2026-05-12
updated: 2026-05-12
---

# `cancel()` idempotency not exercised across all hook states (after-final, double-cancel, during-loadHistory)

## Priority
Low

## Spec reference
Item: `epic-bootstrap-readiness-in-flight-affordances` (Unit 5)
Acceptance criterion: "cancel() is a no-op when not streaming"

## Gap type
adversarial / state-transition boundary — existing test (`use-streamed-send.test.tsx:985`) covers `cancel() before send()`. Other no-op states untested: `cancel()` after `final` arrives, double-cancel, cancel during `loadHistory`.

## Suggested test
```ts
// packages/ui/src/__tests__/use-streamed-send.test.tsx
it("cancel() after the stream finalized is a no-op (idempotent)", async () => {
  const { result } = renderHook(...);
  await act(async () => { await result.current.send(...); });
  expect(() => result.current.cancel()).not.toThrow();
});

it("double cancel() while streaming is a no-op the second time", async () => { /* … */ });
```

## Test location (suggested)
`packages/ui/src/__tests__/use-streamed-send.test.tsx`
