---
id: feature-mutating-ipc-channels-envelope-migration-step-8-author
kind: story
stage: done
tags: [refactor, security]
parent: feature-mutating-ipc-channels-envelope-migration
depends_on: [feature-mutating-ipc-channels-envelope-migration-step-7-lock-and-config]
release_binding: v0.1.2
created: 2026-05-14
updated: 2026-05-14
---

# Migrate `praxis.author.*` invoke channels to envelope pattern

Apply the parent feature's per-step recipe. Largest channel family — ~12 channels.

## Channels in scope
First identify the full list via `grep -n 'handle("praxis.author.' packages/desktop/electron/main/ipc-server.ts`. Visible from earlier inventory:
- `praxis.author.deleteGate` (`{ gateId: string; reason?: string }`)
- `praxis.author.getCourseSummary` (string — courseId)
- `praxis.author.listFragmentOverrides` (`{ modeId: string }`)
- `praxis.author.setGlobalPrompt` (`{ text: string | null }`)
- `praxis.author.getGlobalPrompt` (no-payload)
- `praxis.author.getModeAppend` (`{ modeId: string }`)
- `praxis.author.exportMemory` (`{ targetPath: string }`)
- ...plus any other `praxis.author.*` channels not listed above (check inventory)

## Files to modify
- `packages/desktop/electron/main/ipc-server.ts` (lines ~735-870 region)
- `packages/client/src/services/author-client.ts`
- `packages/desktop/electron/main/__tests__/author-channel-envelope.test.ts` (new)

## Acceptance
- Every `praxis.author.*` invoke channel wrapped.
- Client methods unwrap.
- Integration test covers a no-payload getter, a structured-payload mutation, and validation-failure paths.
- Typecheck/test pass.

## Risk + rollback
- **Risk**: Medium — author surface is power-user; UI affordances (Configure tab, prompt editor) consume these.
- **Rollback**: revert the commit.

## Implementation notes
- This step has the most surface area. Scope discipline: do not refactor author-channel logic, only the wire-format wrap. Save logic refactors for separate stories.
- The `praxis.author.exportMemory` channel touches the filesystem — verify path-validation schema preserves the original behavior.

## Review

**Verdict: Approved. Advance to done.**

Reviewed commit `5a1cf55`. All 24 `praxis.author.*` invoke channels confirmed wrapped.

### Correctness

All 24 channels migrate cleanly from bare `handle(ch, async(_event, input) => …)` to `handleEnvelope`/`wrapEnvelope`. No behavior changes inside the service calls.

**Channel inventory** (24 confirmed via grep on current `ipc-server.ts`):
`updateCourse`, `createLesson`, `updateLesson`, `deleteLesson`, `createGate`, `updateGate`, `deleteGate`, `overrideGate`, `getCourseSummary`, `customizePrompt`, `listFragmentOverrides`, `clearFragmentOverride`, `setStyleSliders`, `setGlobalPrompt`, `getGlobalPrompt`, `setModeAppend`, `getModeAppend`, `previewPrompt`, `previewPromptWithAttribution`, `resetConcept`, `clearMisconception`, `exportMemory`, `deleteAllMemory`, `listConfiguratorActions`.

**Shared schemas**: `modeIdSchema` and `previewPromptSchema` correctly extracted for the three channels sharing each shape.

**`exactOptionalPropertyTypes` interaction**: `previewPromptSchema` declares `draftGlobal: z.string().nullable().optional()` and the handler spreads conditionally (`...(input.draftGlobal !== undefined && { draftGlobal: input.draftGlobal })`). This is the correct pattern — it avoids writing `undefined` into an exactOptional slot. Same pattern applied consistently to `previewPromptWithAttribution`, `updateCourse`/`reason`, `createLesson`/optional fields, `deleteLesson`/`reason`, `deleteGate`/`reason`, `updateGate`/`reason`, `listConfiguratorActions`/`fromTs`+`limit`.

**`Parameters<...>` cast in `updateCourse`**: `patch: input.patch as Parameters<typeof services.authoring.updateCourse>[0]["patch"]` — necessary because the Zod schema's `patch` type (`{ title?: string; subject?: string; gradeLevel?: string }`) is narrower than the service's `Partial<Pick<Course, "title"> & { subject, gradeLevel, thresholds }>`. The cast is safe: extra fields the schema doesn't define can't arrive through Zod validation, and the narrower type is a valid subtype. No behavior change.

**`z.unknown()` for `GateTarget`/`SuccessCriteria`**: These are opaque discriminated-union types that already validate internally when passed to `services.authoring.createGate/updateGate`. Using `z.unknown()` with a downstream cast is acceptable here — full Zod schemas for these types would duplicate logic that lives in `@praxis/tools`. The field-presence check (`z.unknown().optional()`) still catches missing fields and returns `VALIDATION_FAILED`.

**`listConfiguratorActions`** optional schema (`z.object({…}).optional()`) handles both `undefined` and `{ limit, fromTs }` — tested explicitly with both.

**`exportMemory` path validation**: `z.string().min(1, "targetPath")` rejects empty paths, preserving the original guard while adding the never-rejects contract. The underlying filesystem I/O is unchanged.

**Client side (`authoring-client.ts`)**: All 23 methods (24 channels — `getGlobalPrompt` is both a channel and a method) converted from direct `return this.transport.invoke<T>(…)` to `await + unwrapEnvelope`. The `IpcEnvelope<T> | T` union type on the transport call is the correct transitional type (backward compat while the wire format rolls out). `void`-return methods correctly omit `return unwrapEnvelope(result)` — `unwrapEnvelope` is called for its throw-on-error side effect.

### Test quality

34 tests (test file header says "~28" — minor stale comment, not a defect). All 34 pass. The lock test file (6 tests) updated correctly: the two previously-rejecting lock tests now assert `resolves.toMatchObject({ ok: false, error: { code: "INTERNAL" } })` and the intermediate `.catch(() => {})` cleanup is dropped, both consistent with the never-rejects contract.

Coverage strategy is sound: 13 channels get dedicated describe blocks covering happy path, validation failures, and INTERNAL error paths. The remaining 11 channels are exercised implicitly through the `makeServices` default mocks in the shared setup — sufficient given they follow the identical pattern. The `deleteGate`/`reason` optional-field test directly verifies the `...(x !== undefined && { x })` spread pattern.

### Nits (no blockers)

- The test file header comment says "Test count: ~28" but there are 34 tests. Harmless.
- The `getCourseSummary` client method now has a very large explicit generic type annotation for `IpcEnvelope<...> | ...` with the full nested object spelled out twice. Could be extracted to a named type, but the current form is correct and readable enough.

### Tests run

- `pnpm vitest run packages/desktop/electron/main/__tests__/author-channel-envelope.test.ts` — 34/34 pass
- `pnpm vitest run packages/desktop/electron/main/__tests__/ipc-server.author.lock.test.ts` — 6/6 pass
- `pnpm --filter @praxis/client test` — 62/62 pass
- `pnpm typecheck` — clean across all packages (including `tsconfig.electron.json` with `exactOptionalPropertyTypes: true`)
- Lint errors in changed files: none (96 pre-existing errors are baseline, none in the modified files)
