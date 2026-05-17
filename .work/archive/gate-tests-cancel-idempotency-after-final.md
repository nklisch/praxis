---
id: gate-tests-cancel-idempotency-after-final
kind: story
stage: done
tags: [testing]
parent: null
depends_on: []
release_binding: null
gate_origin: tests
created: 2026-05-12
updated: 2026-05-17
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

## Implementation notes — Land mode

Tests already shipped at the suggested location; orchestrator audit confirmed:

- `packages/ui/src/__tests__/use-streamed-send.test.tsx:996` — `it("cancel() after the stream finalized is a no-op (idempotent)")` asserts the post-final no-op contract and that no extra cancel-marker is appended.
- `packages/ui/src/__tests__/use-streamed-send.test.tsx:1026` — `it("double-cancel during streaming produces a single cancel-marker")` covers the double-cancel-while-streaming case.

The third sub-case the gate mentions (`cancel() during loadHistory`) is implicitly covered because `loadHistory` is not on `useStreamedSend` — there's no in-hook state that would diverge from the pre-send no-op already pinned. No additional tests required.

Gate is fully closed — advance to review.

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Land-mode closure. Citations verified — both `it("cancel() after the stream finalized is a no-op")` at line 996 and `it("double-cancel during streaming produces a single cancel-marker")` at line 1026 are present in `use-streamed-send.test.tsx`. The `cancel() during loadHistory` sub-case the gate also mentioned isn't a real state on this hook, so its omission is correct.
