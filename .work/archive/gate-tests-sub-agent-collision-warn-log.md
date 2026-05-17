---
id: gate-tests-sub-agent-collision-warn-log
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

# Sub-agent `parentCallId` collision — silent no-op vs. warn-log contract is unpinned

## Priority
Low

## Spec reference
Item: `feature-agent-transparency-ux-subagent-channel` (Unit 3)
Acceptance criterion: Existing test ("start() with same parentCallId is a no-op (collision)") locks the silent-no-op behavior. Spec is silent on whether this should warn-log — adversarially, an unnoticed double-start may indicate a bug in the explorer or registry.

## Gap type
adversarial-spec-silent

## Suggested resolution
Either confirm silent-no-op is correct (current behavior) and document the rationale in the test name, or add a warn-log assertion:
```ts
it("start() with duplicate parentCallId warn-logs the collision so it's diagnosable", () => {
  registry.start({ parentCallId: "call-1", ... });
  const log = vi.fn();
  registry.start({ parentCallId: "call-1", ... });
  expect(log).toHaveBeenCalledWith(expect.stringContaining("collision"));
});
```

## Test location (suggested)
`packages/core/src/services/__tests__/subagent-registry.test.ts`

## Implementation notes — Land mode

The gate offered two resolutions: (A) document silent-no-op as intentional in the test name, or (B) add a warn-log assertion. Resolution (A) shipped:

- `packages/core/src/services/__tests__/subagent-registry.test.ts:97` — `it("start() with same parentCallId is a silent no-op (by design — collision is a registry guarantee, not an error)")` makes the silent-by-design contract explicit in the test name, with an inline comment pinning the rationale ("Spec-silent contract pin: the registry treats collision as idempotent") and a follow-up assertion that no event is emitted on the second start.

The silent-by-design choice is correct given collision is a structural guarantee from the registry, not a caller error condition — warn-logging would create noise on legitimate idempotent retries.

Gate is fully closed — advance to review.

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Land-mode closure. The gate offered two resolutions; option (A) shipped — the test at `subagent-registry.test.ts:97` is named to make the silent-by-design contract explicit and its inline comment documents the rationale. The choice is correct given collision is a structural guarantee, not a caller error condition that would benefit from log noise.
