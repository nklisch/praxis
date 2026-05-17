---
id: feature-mutating-ipc-channels-envelope-migration-step-5-assignments
kind: story
stage: done
tags: [refactor, security]
parent: feature-mutating-ipc-channels-envelope-migration
depends_on: [feature-mutating-ipc-channels-envelope-migration-step-4-memory]
release_binding: v0.1.2
created: 2026-05-14
updated: 2026-05-14
---

# Migrate `praxis.assignments.*` invoke channels to envelope pattern

Apply the parent feature's per-step recipe.

## Channels in scope
- `praxis.assignments.get` (`{ assignmentId: string }`)
- `praxis.assignments.getResponses` (`{ assignmentId: string }`)
- `praxis.assignments.submit` (`{ assignmentId: string, ... }`) — mutation, security-relevant

## Files to modify
- `packages/desktop/electron/main/ipc-server.ts` (lines ~489-540)
- `packages/client/src/services/assignments-client.ts`
- `packages/desktop/electron/main/__tests__/assignments-channel-envelope.test.ts` (new)

## Acceptance
- All 3 channels wrapped with `handleEnvelope` (structured payloads).
- Client methods unwrap.
- Integration test asserts envelope shape (success + validation failure on missing/empty assignmentId).
- Typecheck/test pass.

## Risk + rollback
- **Risk**: Medium — `submit` is mutation-heavy; renderer hooks branch on success/failure.
- **Rollback**: revert the commit.

## Review

**Verdict: Approved.**

Reviewed commit `1cebc156`. Three channels wrapped correctly; client updated; 16 tests pass.

### Correctness

All three channels use `handleEnvelope` with a shared `assignmentInputSchema = z.object({ assignmentId: z.string().min(1) })`. The schema is defined once inline and reused — correct, no duplication.

`submit` schema concern checked: the production `AssignmentServiceImpl.submit()` accepts `{ assignmentId, responses?, submittingSessionId? }` but both optional params are server-side concerns (responses are fetched from DB; `submittingSessionId` is only populated by the engine session path, not the IPC submit path). The `use-assignment.ts` hook confirms the UI only ever sends `{ assignmentId }`. The schema is deliberately narrow and correct.

`list` and `recordResponse` are intentionally out of scope — both remain legacy (no envelope) and are not mutating channels targeted by this migration step.

Client-side `unwrapEnvelope` calls use the backward-compat union type `IpcEnvelope<T> | T`, which is correct for a rolling migration.

Path leakage: `toEnvelopeError` in `ipc-error-envelope.ts` maps all non-Zod, non-allowlisted errors to `GENERIC_INTERNAL_MESSAGE = "An internal error occurred"` — filesystem paths in error messages cannot reach the renderer.

### Test quality

16 tests across 3 `describe` blocks. Coverage per channel:
- `get`: success, not-found (null), empty assignmentId, missing assignmentId, non-object payload, INTERNAL on throw — 6 cases.
- `getResponses`: success, empty array, empty assignmentId, missing assignmentId, INTERNAL on throw — 5 cases.
- `submit`: success, empty assignmentId, missing assignmentId, INTERNAL on throw, path-leakage guard — 5 cases.

`get` has an extra non-object-payload case not duplicated for the other two. `getResponses` lacks the non-object test — acceptable; the Zod schema rejection behavior is schema-level, not per-channel; covered once is sufficient.

The path-leakage test correctly verifies `.error.message` does not contain the filesystem path or database filename from the thrown error.

Minor nit: the file-header comment says "Test count: 13" but there are 16 tests. Does not affect correctness.

### Suite results

`pnpm --filter @praxis/desktop test`: 238 tests, 19 files, all pass.
`pnpm --filter @praxis/client test`: 62 tests, 7 files, all pass.
