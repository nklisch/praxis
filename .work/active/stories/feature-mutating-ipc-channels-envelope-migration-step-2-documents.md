---
id: feature-mutating-ipc-channels-envelope-migration-step-2-documents
kind: story
stage: done
tags: [refactor, security]
parent: feature-mutating-ipc-channels-envelope-migration
depends_on: [feature-mutating-ipc-channels-envelope-migration-step-1-session]
release_binding: v0.1.2
created: 2026-05-14
updated: 2026-05-14
---

# Migrate `praxis.documents.*` invoke channels to envelope pattern

Apply the parent feature's per-step recipe.

## Channels in scope
- `praxis.documents.list` (no-payload getter)
- `praxis.documents.get` (string payload — documentId)
- `praxis.documents.delete` (string payload — documentId)

## Files to modify
- `packages/desktop/electron/main/ipc-server.ts` (lines ~281-292)
- `packages/client/src/services/documents-client.ts`
- `packages/desktop/electron/main/__tests__/documents-channel-envelope.test.ts` (new)

## Acceptance
- All 3 channels wrapped.
- Client methods unwrap.
- Integration test asserts envelope shape (success + validation failure on `get`/`delete` with empty/missing string).
- Typecheck/test pass.

## Risk + rollback
- **Risk**: Low — documents API is read-mostly; only `delete` mutates and is called rarely.
- **Rollback**: revert the commit.

## Implementation

Channels migrated (3):
- `praxis.documents.list` — `wrapEnvelope` (no-payload getter)
- `praxis.documents.get` — `handleEnvelope` + `z.string().min(1, "documentId")`
- `praxis.documents.delete` — `handleEnvelope` + `z.string().min(1, "documentId")`

Client methods updated (3): `list`, `get`, `delete` in `DocumentsClientImpl` all call `unwrapEnvelope(result)`.

Tests: 17 new tests in `documents-channel-envelope.test.ts` covering success, null/empty validation, type-mismatch validation, INTERNAL error, and path-leakage redaction for all 3 channels.

Also updated `ipc-server.envelope-migration.test.ts`: converted the stale "non-migrated control" test for `praxis.documents.list` to a migrated-channel confirmation.

Verification:
- `pnpm --filter @praxis/desktop typecheck` — pass
- `pnpm --filter @praxis/client typecheck` — pass
- New test file: 17/17 pass
- `pnpm --filter @praxis/desktop test` — 171/171 pass (16 files)
- `pnpm --filter @praxis/client test` — 62/62 pass (7 files)

## Review

Verdict: **approved**.

Reviewer ran:
- `pnpm vitest run packages/desktop/electron/main/__tests__/documents-channel-envelope.test.ts` — 17/17 pass
- `pnpm vitest run packages/desktop/electron/main/__tests__/ipc-server.envelope-migration.test.ts` — 23/23 pass
- `pnpm --filter @praxis/client test` — 62/62 pass (7 files)

### Correctness

All 3 channels wrapped correctly:

- `praxis.documents.list`: `wrapEnvelope` (no-payload) — correct shape for a no-arg getter.
- `praxis.documents.get`: `handleEnvelope` + `z.string().min(1, "documentId")` — matches step-1 session pattern for string-payload channels.
- `praxis.documents.delete`: same as get — consistent.

Client `unwrapEnvelope` applied to all three methods with the union type `IpcEnvelope<T> | T` that keeps legacy compatibility during rollout.

### Template adherence

Structure is faithful to `session-channel-envelope.test.ts` (step-1): same mock layout, same `makeFakeLogger` / `makeServices` factories, same `beforeEach`/`afterEach` teardown, same describe-block naming convention (`— envelope wiring`, `— string-payload envelope`).

### Test quality

Coverage matrix per channel:

| Case | list | get | delete |
|---|---|---|---|
| Success (truthy value) | yes | yes | yes |
| Success (null / empty / void) | yes (empty []) | yes (null) | yes (undefined) |
| VALIDATION_FAILED empty string | n/a | yes | yes |
| VALIDATION_FAILED non-string | n/a | yes | yes |
| VALIDATION_FAILED undefined | n/a | yes | yes |
| INTERNAL (throw) | yes | yes | yes |
| INTERNAL path-leakage guard | yes | yes | yes |

No gaps. The guard tests assert `not.toContain("/home/user/.praxis")` and `not.toContain("dev.db")` — matching the step-1 redaction contract.

The `get` and `delete` success tests additionally assert `toHaveBeenCalledWith("doc-1")`, confirming the parsed payload is forwarded. Validation-failure tests assert `not.toHaveBeenCalled()`, confirming the service is short-circuited.

### Control-test conversion

The stale "non-migrated control" assertion in `ipc-server.envelope-migration.test.ts` was correctly converted from `.rejects.toThrow(...)` to `.resolves.toMatchObject({ ok: false, error: { code: "INTERNAL" } })`. The comment header at the top of that file was updated to reflect the new status. Test count advanced from 22 → 23.

### Minor observation (non-blocking)

The two `as any` casts in `ipc-server.ts` (lines 309, 320) are annotated with `// biome-ignore lint/suspicious/noExplicitAny: branded string passthrough`. The comment is slightly misleading — `DocumentsServiceImpl.get` and `.delete` accept plain `string`, not a branded type, so the cast is not load-bearing. The `handleEnvelope` generic infers `TIn = string` from the schema, which is structurally compatible with the concrete service method. The code is correct; the comment overstates the reason. Not a blocker — the typecheck is clean and behavior is correct.
