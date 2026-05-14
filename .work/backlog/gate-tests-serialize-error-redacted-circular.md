---
id: gate-tests-serialize-error-redacted-circular
kind: story
stage: backlog
tags: [testing, security]
parent: null
depends_on: []
release_binding: null
gate_origin: tests
created: 2026-05-14
updated: 2026-05-14
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
