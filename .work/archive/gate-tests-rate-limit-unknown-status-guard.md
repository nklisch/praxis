---
id: gate-tests-rate-limit-unknown-status-guard
kind: story
stage: done
tags: [testing]
parent: null
depends_on: [feature-rate-limit-error-structured-fields]
release_binding: null
gate_origin: tests
created: 2026-05-14
updated: 2026-05-17
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

## Implementation notes — Land mode (via dep closure)

Closed as a side-effect of implementing the parent dependency `feature-rate-limit-error-structured-fields` (commit `d31fb18`). The gate offered two valid resolutions; the "preferred" one shipped — the warned-status branch drops with a warn-log instead of surfacing as a user-facing error.

Test landed at `packages/engines/src/__tests__/claude-code-events.test.ts:92` — `it("drops rate_limit_event with unknown status (forward-compat with future SDK additions)")`:
- Uses the gate's exact suggested input (`status: "warned"`, `rateLimitType: "monthly"`, etc.).
- Asserts `result === null` (drop, not surface as error).
- Asserts `log.warn` was called with `"engine.claude-code.rate_limit_unknown_status"`.

The adapter implementation that backs this test is at `packages/engines/src/claude-code/events.ts:151-160` — the new `if (info.status !== "rate_limited")` branch that the feature added.

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Closed by dependency. Both the test and the implementation it pins shipped in the same commit (`d31fb18`) as part of feature-rate-limit-error-structured-fields. The future-SDK-drift property is now defended by a regression test in the same file as the existing rate-limit cases.
