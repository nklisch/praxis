---
id: gate-tests-interrupt-all-event-fanout-count
kind: story
stage: review
tags: [testing]
parent: null
depends_on: []
release_binding: null
gate_origin: tests
created: 2026-05-14
updated: 2026-05-17
---

# `interruptAllForSession` event fanout call-count under concurrent in-flight items is untested

## Priority
Low

## Spec reference
Bound item: `epic-tutor-session-feel-cancellation-propagation-engine-and-subagent`

Acceptance criterion (Unit 7): "When the parent session is aborted,
in-flight `SubAgentItem`s for that session transition to `interrupted`
and emit a final event." Existing tests cover the happy path (target
session affected, other session preserved), but no test asserts the
listener fanout call-count under concurrent in-flight items.

## Gap type
Missing test for boundary (concurrency-ish — sequential interrupts of
multiple items).

## Suggested test

```typescript
// packages/core/src/services/__tests__/subagent-registry.test.ts (addition)

it("interruptAllForSession emits exactly one terminal event per in-flight item", () => {
  // Start 3 sub-agents for sess-X; capture events; interruptAllForSession(sess-X);
  // Assert exactly 3 finished events with status:"interrupted" delivered (no duplicates, no leaks)
});
```

## Implementation notes — Land mode

The "exactly one terminal event per in-flight item" property is already pinned at `packages/core/src/services/__tests__/subagent-registry.test.ts:445` via `it("interrupts multiple running items for the same session")`:

- Starts two sub-agents for `sess-multi`
- Calls `registry.interruptAllForSession("sess-multi")`
- Asserts `finished.toHaveLength(2)` (no duplicates, no leaks)
- Asserts each finished event's `parentCallId` is in the started set
- Asserts every registry item for `sess-multi` transitions to status `interrupted`

The gate's suggested N=3 case is a different witness of the same property the N=2 case pins. Increasing N would not add coverage of a different state; the property's adversarial dimension is "duplicates or leaks on fanout", which is closed at N=2.

Gate is functionally closed — advance to review.
