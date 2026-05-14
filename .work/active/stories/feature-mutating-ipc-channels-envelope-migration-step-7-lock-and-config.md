---
id: feature-mutating-ipc-channels-envelope-migration-step-7-lock-and-config
kind: story
stage: done
tags: [refactor, security]
parent: feature-mutating-ipc-channels-envelope-migration
depends_on: [feature-mutating-ipc-channels-envelope-migration-step-6-packs]
release_binding: v0.1.2
created: 2026-05-14
updated: 2026-05-14
---

# Migrate `praxis.lock.*` and `praxis.config.*` remaining invoke channels to envelope pattern

Apply the parent feature's per-step recipe. Some `lock` / `config` channels were migrated in earlier work — this step covers the remaining ones.

## Channels in scope
- `praxis.lock.isSet` (no-payload)
- `praxis.lock.isUnlocked` (no-payload)
- `praxis.lock.lock` (no-payload)
- `praxis.config.isLocked` (no-payload)
- `praxis.config.unlock` (string — code)
- `praxis.config.selectedEngine` (no-payload getter)
- `praxis.config.bootstrapConfig` (no-payload getter)
- `praxis.config.firstRunCompleted` (no-payload getter)
- `praxis.config.markFirstRunComplete` (no-payload mutation)

## Files to modify
- `packages/desktop/electron/main/ipc-server.ts` (lines ~185, 196, 200, 248, 262, 266, 564-588)
- `packages/client/src/services/lock-client.ts`
- `packages/client/src/services/config-client.ts`
- `packages/desktop/electron/main/__tests__/lock-config-channel-envelope.test.ts` (new)

## Acceptance
- All 9 channels wrapped (mostly `wrapEnvelope`; `praxis.config.unlock` uses `handleEnvelope` with `z.string().min(1)`).
- Client methods unwrap.
- Integration test covers a getter and the `unlock` mutation (success + validation failure with empty code).
- Typecheck/test pass.

## Risk + rollback
- **Risk**: Medium — lock state is security-sensitive; UI hooks (`useLock`) consume these directly.
- **Rollback**: revert the commit.

## Review (2026-05-14)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- `lock-config-channel-envelope.test.ts` top-level comment says "~18" tests but the suite delivers 25. Minor; delete or update the count.

**Notes**:
All 9 channels correctly wrapped. `wrapEnvelope` used for no-payload getters and void mutations; `handleEnvelope` with `z.string().min(1)` used for `praxis.config.unlock` — the only channel with a payload. Client-side, each method is now `async` and threads through `unwrapEnvelope`. The `IpcEnvelope<T> | T` union type on the `transport.invoke` call is the standard compatibility shim used in all prior steps.

`ipc-server.first-run-update.test.ts`: the updated assertion (`toMatchObject({ ok: true, value: true })`) is correct and justified — the channel was migrated in this step and the old raw-value assertion would have become a false positive.

Test coverage is thorough: every channel gets a happy-path success case and a service-throws → `INTERNAL` case. `praxis.config.unlock` additionally gets a VALIDATION_FAILED case for empty string and wrong type, which is the security-critical path for this step.

Typecheck and all 31 tests pass (25 new + 6 pre-existing).
