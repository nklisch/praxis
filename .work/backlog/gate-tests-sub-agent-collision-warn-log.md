---
id: gate-tests-sub-agent-collision-warn-log
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
