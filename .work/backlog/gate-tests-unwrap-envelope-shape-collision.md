---
id: gate-tests-unwrap-envelope-shape-collision
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

# `unwrapEnvelope` passthrough collision-shape edge case is not tested

## Priority
Low

## Spec reference
Bound item: `epic-security-hardening-round-2-ipc-boundary-envelope-and-redactor`

Acceptance criterion (Risks section bullet #4): "`unwrapEnvelope`'s
passthrough behavior on non-envelope values is a footgun if a future
migration accidentally returns a value that looks like an envelope
(`{ ok: ... }`). Mitigation: the shape check requires both `ok` AND
either `value` or `error` keys to be present and the right type —
vanishingly small collision surface, but worth a comment in the source."

## Gap type
Adversarial-spec-silent (the documented footgun has no regression test).

## Suggested tests

```typescript
// packages/client/src/__tests__/envelope.test.ts (additions)

it("unwrapEnvelope passes through { ok: 'truthy-non-bool' } as a legacy value (shape-check is strict)", () => {
  expect(unwrapEnvelope({ ok: "truthy-but-not-bool" } as never)).toEqual({ ok: "truthy-but-not-bool" });
});

it("unwrapEnvelope passes through { ok: true } without a 'value' key as a legacy value", () => {
  expect(unwrapEnvelope({ ok: true } as never)).toEqual({ ok: true });
});
```
