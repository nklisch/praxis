---
id: gate-tests-prompt-customization-lock-gating
kind: story
stage: drafting
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

## Implementation discovery

**The spec asserts a contract the code does not honor at the service layer. This is a real design question, not a missing test.**

### What the code actually does

`AuthoringServiceImpl` is deliberately lock-unaware. The top comment in `packages/core/src/services/authoring-service.ts` line 8 states explicitly:

> "Lock enforcement happens in the IPC layer (requireUnlocked guard), not here."

The lock guard lives entirely in `packages/desktop/electron/main/ipc-server.ts`:

- `setGlobalPrompt` handler (line 716–718): calls `await requireUnlocked()` before delegating to `services.authoring.setGlobalPrompt()`
- `setModeAppend` handler (line 727–730): calls `await requireUnlocked()` before delegating to `services.authoring.setModeAppend()`
- `requireUnlocked()` (line 73–78): throws `"Locked: configure surface requires unlock. Call praxis.lock.unlock first."` when `services.lock.isUnlocked()` returns false

All other author write handlers follow the same pattern — `requireUnlocked()` is the IPC-layer backstop for the entire `praxis.author.*` channel group.

### The spec premise is incorrect

The spec says "`customizePrompt` does this today" — but there is no existing `customizePrompt` lock-gating test anywhere in the codebase (`packages/core/src/__tests__/`, `packages/desktop/electron/main/__tests__/`, or elsewhere). That reference describes a test that was never written.

### What needs to be decided

The lock-gating contract can be enforced at either layer:

**Option A — keep it in the IPC layer (current architecture), write IPC-level tests**
- Tests would live in `packages/desktop/electron/main/__tests__/` and exercise the `praxis.author.setGlobalPrompt` / `praxis.author.setModeAppend` IPC handlers with a locked `LockService`
- Pro: matches the stated architecture. Con: IPC handler tests are heavier to set up (Electron IPC mocking).

**Option B — move lock enforcement into `AuthoringServiceImpl`**
- Add `lockService: LockService` to `AuthoringServiceDeps`, call `lockService.isUnlocked()` at the top of each write method, and throw if locked
- Tests would live in `packages/core/src/__tests__/authoring-service.test.ts` exactly as the story suggests
- Pro: defense-in-depth (guard survives if Praxis gains a non-IPC transport). Con: requires updating the service, its deps injection, and `buildServices`; the IPC guard becomes redundant (keep both = double defense, remove IPC guard = reduces defense-in-depth).

This decision changes `AuthoringServiceImpl`'s interface and the `buildServices` wiring — it is broader scope than a test-only story authorizes. A human decision is needed before implementation can proceed.

### Recommended action

Decide between Option A and Option B, then re-scope this story (or spawn a new story for the service change under Option B). Stage has been reset to `drafting` pending that decision.
