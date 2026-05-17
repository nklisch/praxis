---
id: gate-tests-serialize-error-redacted-circular
kind: story
stage: done
tags: [testing, security]
parent: null
depends_on: []
release_binding: null
gate_origin: tests
created: 2026-05-14
updated: 2026-05-17
---

# `serializeErrorRedacted` redaction of a circular-object stack is untested

## Priority
Low

## Spec reference
Bound item: `epic-security-hardening-round-2-ipc-boundary-envelope-and-redactor`

Acceptance criterion (Unit 2 testing list): "`serializeErrorRedacted`
preserves `name` / `code` / stack shape" + the existing `serializeError`
test "never throws on a circular object." The redacted variant doesn't
have an equivalent assertion — a regression that adds a JSON-stringify
on the input would surface only on circular inputs.

## Gap type
Adversarial-spec-silent (defensive).

## Suggested test

```typescript
// packages/core/src/types/__tests__/errors.test.ts (addition)

it("serializeErrorRedacted never throws on a circular object input", () => {
  type Circ = { self?: Circ; message: string };
  const a: Circ = { message: "loop" };
  a.self = a;
  expect(() => serializeErrorRedacted(a)).not.toThrow();
});
```

## Implementation notes

Added the new test at line 221 in `packages/core/src/types/__tests__/errors.test.ts`,
inside the existing `describe("serializeErrorRedacted", ...)` block. No function
change was needed — `serializeErrorRedacted` delegates to `serializeError` first,
which handles circular objects safely by reading only `instanceof Error` properties
and `"message" in err` fields (never calls `JSON.stringify`). The test passes
green, confirming the current implementation is already throw-safe.

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Diff inspected at commit `c53fb12`. New test at `errors.test.ts:221` inside the `serializeErrorRedacted` describe block exercises a self-referential circular object. No source change needed — `serializeErrorRedacted` delegates to `serializeError` which only inspects `instanceof Error` properties (no `JSON.stringify` on input). Test pins the property so a future regression that adds stringify would surface.
