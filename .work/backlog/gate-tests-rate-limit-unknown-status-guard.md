---
id: gate-tests-rate-limit-unknown-status-guard
kind: story
stage: backlog
tags: [testing]
parent: null
depends_on: []
release_binding: null
gate_origin: tests
created: 2026-05-14
updated: 2026-05-14
---

# Rate-limit error format for unknown `rateLimitType` (future SDK addition) is unguarded by test

## Priority
Low

## Spec reference
Bound item: `story-fix-rate-limit-error-message-format`

Acceptance criterion (story body, "Out-of-scope" section): "`info.status
=== "allowed"` check whitelists by exact string; if the SDK ever adds new
informational statuses (e.g., `"warned"`), they would surface as errors."
This is a known fragile branch.

## Gap type
Adversarial-spec-silent (future SDK drift detector).

## Suggested test

```typescript
// packages/engines/src/__tests__/claude-code-events.test.ts (addition)

it("rate_limit_event with unknown rateLimitType surfaces an error event without throwing (future-SDK-status guard)", () => {
  const result = mapClaudeCodeEvent(
    {
      type: "rate_limit_event",
      rateLimitInfo: {
        status: "warned",
        resetsAt: 1_777_790_400,
        rateLimitType: "monthly",
        isUsingOverage: false,
      },
    },
    { serverName: "praxis" },
  );
  // Either expect the warned-status branch to drop (preferred) OR document the current "surfaces error" behavior
  expect(() => result).not.toThrow();
});
```

This pairs with `idea-rate-limit-error-structured-fields` (the parked
follow-up to enrich the error object with `details: { rateLimitType,
resetsAt, isUsingOverage }`). When that idea is scoped, this test
becomes part of its acceptance.
