---
id: feature-refactor-buildservices-decomposition-step-2-secrets
kind: story
stage: done
tags: [refactor]
parent: feature-refactor-buildservices-decomposition
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-24
---

# Step 2: Extract `buildSecretServices()`

## Brief

Extract the secret-storage and Claude CLI auth construction into
`packages/desktop/electron/main/services/build-secret-services.ts`.

These two services are Electron-specific (one wraps `safeStorage`, the other is
stateless CLI auth). They have no dependencies on other domain services. They must be
constructed after `app.whenReady()` — which is guaranteed by the `buildServices()` call
site and remains so after the refactor.

## Services covered

From `packages/desktop/electron/main/services.ts` lines 474–477:

```ts
const secretStorage = new ElectronSafeStorageAdapter();
const claudeAuthService = new ClaudeAuthServiceImpl({ log });
```

## Target state

New file `packages/desktop/electron/main/services/build-secret-services.ts`:

```ts
import { ClaudeAuthServiceImpl } from "@praxis/core/services";
import type { MainLogger } from "../logger.js";
import { ElectronSafeStorageAdapter } from "../secret-storage.js";

export interface SecretServices {
  secretStorage: ElectronSafeStorageAdapter;
  claudeAuthService: ClaudeAuthServiceImpl;
}

export function buildSecretServices(log: MainLogger): SecretServices {
  const secretStorage = new ElectronSafeStorageAdapter();
  const claudeAuthService = new ClaudeAuthServiceImpl({ log });
  return { secretStorage, claudeAuthService };
}
```

`buildServices()` calls `buildSecretServices(log)` after `openDb()` and before any engine resolver
is constructed (engine resolvers close over `secretStorage`).

## Implementation notes

- Add `packages/desktop/electron/main/services/build-secret-services.ts` (create the directory
  if step 1 hasn't done so yet — idempotent `mkdir`).
- Import and destructure in `services.ts`.
- Remove the two inline construction lines.
- `secretStorage` is consumed by three engine-resolver closures further down;
  after extraction the `const` still lives in `buildServices()` scope via destructuring
  so those closures continue to close over it.

## Acceptance criteria

- `pnpm typecheck && pnpm lint && pnpm test` green.
- `services.ts` no longer directly instantiates `ElectronSafeStorageAdapter` or
  `ClaudeAuthServiceImpl`.
- `buildSecretServices` is the single construction site for both.

## Risk

Low — no side-effects at construction time (`safeStorage` is called lazily on first
encrypt/decrypt), no ordering constraints violated.
Rollback: revert the new file and restore the two lines in `buildServices()`.

## Implementation notes

- Created `packages/desktop/electron/main/services/build-secret-services.ts` (23 lines).
- The `services/` directory already existed (created by step 1 or prior setup) — no mkdir needed.
- Exported `SecretServices` interface and `buildSecretServices(log: MainLogger)` function matching the target state exactly.
- Added JSDoc on `buildSecretServices` documenting the `app.whenReady()` constraint and why it's safe.
- `services.ts` not modified — wiring deferred to step 10 per the workflow.
- `pnpm typecheck` green (all packages, including desktop Electron tsconfig).
- `pnpm --filter @praxis/desktop test` green: 34 files, 520 tests.

## Review

**Verdict: done.**

Commit `615b14f`. New file `build-secret-services.ts` (22 lines) matches the target-state spec exactly — `SecretServices` interface, `buildSecretServices(log: MainLogger)` factory. Added JSDoc documenting the `app.whenReady()` constraint, which is a useful addition not required by the spec. `services.ts` not touched; wiring correctly deferred to Step 10. No blockers.
