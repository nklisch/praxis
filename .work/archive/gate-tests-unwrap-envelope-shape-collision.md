---
id: gate-tests-unwrap-envelope-shape-collision
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

## Implementation notes

- Two collision-shape regression tests added to `packages/client/src/__tests__/envelope.test.ts` (lines 68–79):
  - "passes through { ok: 'truthy-non-bool' } as a legacy value (shape-check is strict)" — pins that a non-boolean `ok` value is not treated as an envelope
  - "passes through { ok: true } without a 'value' key as a legacy value" — pins that `ok: true` alone (missing the required `value` key) passes through unchanged
- Source comment added in `packages/client/src/transport/envelope.ts` above `isEnvelope` (before line 61 in original; lines 61–70 after edit) explaining the two-key shape requirement and citing the test names as pin points.
- All 9 tests pass; `pnpm typecheck` clean.

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Diff inspected at commit `3936d46`. Two new tests in `envelope.test.ts` pin the passthrough behavior on `{ ok: 'truthy-non-bool' }` and `{ ok: true }` without a `value` key. Source comment added above `isEnvelope` in `envelope.ts` documents the two-key shape requirement (strict boolean `ok` + matching payload key) and cites the test names. No behavior change — the existing shape check is already strict enough.
