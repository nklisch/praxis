---
id: gate-tests-prompt-customization-lock-gating
kind: story
stage: implementing
tags: [testing, security]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: tests
created: 2026-05-12
updated: 2026-05-12
---

# Lock-gating on `setGlobalPrompt` / `setModeAppend` is unverified

## Priority
High

## Spec reference
Items:
- `feature-prompt-customization-layers-settings-global`
- `feature-prompt-customization-layers-configure-mode-append`
- `feature-prompt-customization-layers-compose-wiring` (Unit 5)

Acceptance criterion: "Lock guard rejects `setGlobalPrompt` / `setModeAppend` calls when locked." (Unit 5) and "Lock-gated: when the configurator is locked, the editor renders read-only..." (Unit 6/7).

## Gap type
Missing test for error case + security boundary. `customizePrompt` does this today; the two new write methods need the same gate exercised.

## Suggested test
```ts
// packages/core/src/__tests__/authoring-service.test.ts
it("setGlobalPrompt rejects when configurator is locked", async () => {
  const { svc, lockService } = makeServiceWithLock();
  await lockService.setLockCode("1234");
  await lockService.lock();
  await expect(svc.setGlobalPrompt("attempt")).rejects.toThrow(/locked|configurator/i);
});

it("setModeAppend rejects when configurator is locked", async () => { /* similar */ });
```

## Test location (suggested)
`packages/core/src/__tests__/authoring-service.test.ts`
