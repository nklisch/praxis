---
id: feature-prompt-customization-layers-compose-wiring
kind: story
stage: done
tags: [content, core]
parent: feature-prompt-customization-layers
depends_on: []
release_binding: v0.1.1
gate_origin: null
created: 2026-05-11
updated: 2026-05-12
---

# Composition infrastructure: types, table, service, session-service reads

## Scope

Implements Units 1–5 of `feature-prompt-customization-layers`. Foundation for
both UI stories. Adds the two new fragment positions, the
`mode_prompt_appends` table, the `PromptCustomizationService`, wires reads
into the session compose path (fixing the pre-existing Phase 11 read gap),
and exposes the `previewPrompt` IPC for the UI to consume.

Required for Stories 2 + 3 to work end-to-end.

## Files to touch

### Types + composition
- `packages/core/src/types/mode.ts` — extend `PromptFragmentPosition` with `"user-global"` and `"user-append"`.
- `packages/curriculum/src/brief/compose.ts` — extend `FRAGMENT_ORDER`.

### Schema + migration
- `packages/core/src/schema.ts` — add `modePromptAppends` table; export from `coreSchema`.
- `drizzle/<next-numbered>.sql` (generated) — commit the generated migration.

### Service
- `packages/core/src/services/prompt-customization-service.ts` (new) — `PromptCustomizationService` interface + `PromptCustomizationServiceImpl`.
- `packages/core/src/services/index.ts` — re-export.
- `packages/core/src/types/services.ts` (or wherever `ServiceDeps` lives) — add `promptCustomization: PromptCustomizationService`.
- `packages/desktop/electron/main/services.ts` — construct in `buildServices`.

### Session-service wiring
- `packages/core/src/services/session-service.ts` — extend `openActive`:
  - Read stored `prompt_overrides` via `promptCustomization.listFragmentOverrides(args.mode.id)` and seed the `overrides` map.
  - Read global fragment via `getGlobalFragment()`; push to `additionalFragments` with `id: "user.global"`, `position: "user-global"`.
  - Read per-mode append via `getModeAppend(args.mode.id)`; push with `id: "user.append.<modeId>"`, `position: "user-append"`.
  - Pass `additionalFragments` to `composeSystemPrompt`.

### Authoring + IPC + Client
- `packages/core/src/services/authoring-service.ts` — add `setGlobalPrompt`, `getGlobalPrompt`, `setModeAppend`, `getModeAppend`, `previewPrompt` methods; audit-log entries for the setters (char count only).
- `packages/core/src/types/configurator-action.ts` (or wherever the union lives) — add new variants `prompt.set_global_fragment`, `prompt.set_mode_append`.
- `packages/desktop/electron/main/ipc-server.ts` — add five handlers under `praxis.author.*`.
- `packages/client/src/services/authoring-client.ts` — add five client methods.

### Mode registry helper
- `packages/curriculum/src/modes/index.ts` (or equivalent) — verify or add a `getMode(modeId): Mode | undefined` lookup helper used by `previewPrompt`.

### Tests
- `packages/curriculum/src/__tests__/compose.test.ts` — assert new positions sort correctly.
- `packages/core/src/services/__tests__/prompt-customization-service.test.ts` (new) — full unit suite.
- `packages/core/src/services/__tests__/session-service.test.ts` — assert stored overrides and new layers take effect in composed prompt.
- `packages/core/src/services/__tests__/authoring-service.test.ts` — assert new methods write + audit-log correctly.

### Pattern update
- `.claude/skills/patterns/mode-prompt-fragment-composition.md` — update the FRAGMENT_ORDER example to include the two new positions; add a note about `user-global` / `user-append` semantics.

## Acceptance Criteria

### Types + composition
- [ ] `PromptFragmentPosition` includes `"user-global"` and `"user-append"`.
- [ ] `FRAGMENT_ORDER` has 9 entries: `preamble, role, principles, tools, context, constraints, user-global, user-append, postamble`.
- [ ] A test asserts that fragments at the two new positions sort between `constraints` and `postamble`.

### Schema + migration
- [ ] `mode_prompt_appends` table exists with `{ modeId TEXT PRIMARY KEY, text TEXT NOT NULL, updatedAt INTEGER NOT NULL }`.
- [ ] Migration SQL committed under `drizzle/`.
- [ ] `pnpm db:migrate` runs cleanly on a fresh DB.

### Service
- [ ] `PromptCustomizationServiceImpl` implements all six interface methods (`getGlobalFragment`, `setGlobalFragment`, `getModeAppend`, `setModeAppend`, `listFragmentOverrides`, `previewPrompt`).
- [ ] Empty / whitespace-only input to setters deletes the row instead of storing empty.
- [ ] Zod cap of 20,000 chars rejected at write time.
- [ ] Service wired into `ServiceDeps` and constructed in `buildServices`.

### Session-service compose path
- [ ] Storing a fragment override via `AuthoringService.customizePrompt` produces a session prompt with the override text in place of the default fragment template.
- [ ] Storing a global fragment produces a session prompt with that text at the `user-global` slot in every mode.
- [ ] Storing a per-mode append for `teach` produces text at the `user-append` slot in teach mode only; opening a `quiz` session does NOT carry the teach append.
- [ ] Dynamic course-context fragment (set when `courseId` is on the session) wins over a stored `context.course-state` override.
- [ ] No regression in existing session tests.

### IPC + client
- [ ] `praxis.author.setGlobalPrompt` / `.getGlobalPrompt` / `.setModeAppend` / `.getModeAppend` / `.previewPrompt` IPC channels exist and round-trip.
- [ ] Client methods on `client.author` invoke the channels and return correctly-typed results.
- [ ] Lock guard rejects `setGlobalPrompt` and `setModeAppend` when the configurator is locked (matches existing `customizePrompt` behavior).

### Audit log
- [ ] `setGlobalPrompt(text)` appends a `prompt.set_global_fragment` action with `chars: trimmed.length`.
- [ ] `setModeAppend({ modeId, text })` appends a `prompt.set_mode_append` action with `modeId` + `chars`.
- [ ] No audit row for read methods (`previewPrompt`, `getGlobalPrompt`, `getModeAppend`).

### previewPrompt semantics
- [ ] `previewPrompt({ modeId })` returns the same string `composeSystemPrompt` would produce against the current stored state.
- [ ] `previewPrompt({ modeId, draftGlobal: "X" })` uses "X" for the user-global slot instead of the stored value.
- [ ] `previewPrompt({ modeId, draftGlobal: null })` returns a prompt with NO user-global slot.
- [ ] Same for `draftAppend`.

### Pattern doc
- [ ] `.claude/skills/patterns/mode-prompt-fragment-composition.md` updated with the new positions.

## References

- Design: `.work/active/features/feature-prompt-customization-layers.md` (Units 1–5)
- Existing patterns: `mode-prompt-fragment-composition`, `config-kv-store`, `service-deps-injection`, `temp-db-test-helper`
- Foundation context: `packages/core/src/services/session-service.ts:567-639`, `packages/curriculum/src/brief/compose.ts`
- Phase 11 read-path bug origin: `packages/core/src/services/authoring-service.ts:215-272` (writes) vs `packages/core/src/services/session-service.ts` (no reads).

<!-- Implementation Notes accumulate here as work progresses. -->

## Implementation notes

### Commit
`341fa63` — implement: feature-prompt-customization-layers-compose-wiring

### Unit 1: Type contract + FRAGMENT_ORDER extension — DONE
- `PromptFragmentPosition` extended with `"user-global"` and `"user-append"` in `packages/core/src/types/mode.ts`.
- `FRAGMENT_ORDER` updated to 9 entries in `packages/curriculum/src/brief/compose.ts`.
- Compose tests (`compose.test.ts`) extended with 4 new cases verifying user-global/user-append sort between constraints and postamble, and that user-global precedes user-append.

### Unit 2: mode_prompt_appends table + migration — DONE
- `modePromptAppends` table added to `packages/core/src/schema.ts` and exported from `coreSchema`.
- Migration generated: `drizzle/0013_chilly_zombie.sql` — single `CREATE TABLE mode_prompt_appends` statement.
- `pnpm db:migrate` applied cleanly to dev DB.

### Unit 3: PromptCustomizationService — DONE
- New service: `packages/core/src/services/prompt-customization-service.ts`.
- Implements all 6 interface methods: `getGlobalFragment`, `setGlobalFragment`, `getModeAppend`, `setModeAppend`, `listFragmentOverrides`, `previewPrompt`.
- Trim-and-null semantics: empty/whitespace-only input deletes the row.
- Zod cap: 20,000 chars, validated at write time.
- `promptCustomization?: PromptCustomizationService` added as **optional** field in `ServiceDeps` (backward compat for existing tests).
- `PromptCustomizationServiceImpl` constructed in `buildServices` and wired into `authoringService` deps and `deps.promptCustomization`.
- Exported from `packages/core/src/services/index.ts`.

### Unit 4: Session-service compose-path wiring — DONE
- `openActive` seeded stored fragment-overrides (via `listFragmentOverrides`) BEFORE the dynamic course-context / assignment-context blocks.
- Global fragment and per-mode append injected as `additionalFragments`.
- Dynamic blocks run AFTER seeding, so they clobber stale user overrides for the same fragment id (correct precedence).
- Regression test added: `session-service.prompt-customization.test.ts` — "REGRESSION: dynamic course-context wins over stored context.course-state override" verifies that a stale `context.course-state` override is masked by the live course state when a courseId is set.

### Unit 5: previewPrompt IPC — DONE
- `previewPrompt(input: PreviewPromptInput): string` added to `PromptCustomizationService` interface and `PromptCustomizationServiceImpl`.
- `setGlobalPrompt`, `getGlobalPrompt`, `setModeAppend`, `getModeAppend`, `previewPrompt` added to `AuthoringService` interface (`tool.ts`) and `AuthoringClient` interface (`client.ts`).
- `AuthoringServiceImpl` updated with all 5 new methods; `AuthoringServiceDeps.promptCustomization` required.
- Existing `authoring-service.test.ts` updated with a `makeStubPromptCustomization()` stub to keep existing tests compiling.
- 5 new IPC handlers in `ipc-server.ts`; 5 new client methods in `authoring-client.ts`.
- `getGlobalPrompt`, `getModeAppend`, `previewPrompt` do NOT write audit rows (pure reads).
- All setters (`setGlobalPrompt`, `setModeAppend`) are lock-gated via existing `requireUnlocked()` guard.

### Audit log variants added
- `{ kind: "prompt.set_global_fragment"; chars: number }` — char count only, not content.
- `{ kind: "prompt.set_mode_append"; modeId: string; chars: number }` — char count only, not content.
Both added to `ConfiguratorAction` union in `packages/core/src/types/configurator.ts`.

### Mode registry helper
Pre-existing: `requireMode(id)` and `getMode(id)` already exported from `@praxis/curriculum/modes`. Used directly in `PromptCustomizationServiceImpl.previewPrompt`.

### Regression test for dynamic-overrides-win precedence
Test: `session-service.prompt-customization.test.ts` — "REGRESSION: dynamic course-context wins over stored context.course-state override". Seeds a stored override for `context.course-state`, opens a session with a courseId (triggering the dynamic course-context path), and asserts the stale override text does NOT appear in the composed prompt.

### Discovery: dist resolution in Vitest
Vitest resolves cross-package imports via the `import` condition (compiled dist), not the `praxis-source` condition (source). When I first ran the tests, the curriculum dist was stale and `FRAGMENT_ORDER` did not include the new positions, causing `user-global` fragments to sort first (indexOf = -1 → sorts before all). Fixed by running `pnpm --filter @praxis/curriculum build` to update dist before the final test run. The full `pnpm build` in the normal dev workflow ensures this doesn't regress.

### Verification output
- `pnpm typecheck`: all packages pass.
- `pnpm lint`: 0 errors on all 15 touched files; pre-existing errors in `claude-cli-sdk` and test stubs unaffected.
- `pnpm test`: 2697 passed, 21 skipped, 0 failed (303 test files, 2 skipped).

## Review (2026-05-12)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- `ServiceDeps.promptCustomization` is optional (`?:`) instead of the mandatory shape the design specified. The composition root always wires it (`services.ts:467,480,552`), so production behavior is correct. Test-side trade-off, well-documented in the agent's notes; if a future test depending on the Phase 11 fragment-override fix forgets to wire it, the override will silently no-op. Worth knowing.

**Notes**:
- All 5 units landed cleanly with audit-log entries recording char count only (no content) and lock-gating at the IPC layer matching the existing `customizePrompt` pattern.
- Phase 11 read-gap fix is verified: `storedOverrides` seeded first; dynamic course/assignment-context blocks overwrite for the same fragment id, preserving "dynamic wins" precedence with a dedicated regression test in `session-service.prompt-customization.test.ts`.
- Pattern doc `.claude/skills/patterns/mode-prompt-fragment-composition.md` updated alongside.
- 734 lines of new test coverage across three files (prompt-customization-service.test.ts, session-service.prompt-customization.test.ts, authoring-service.test.ts).

Approved and advancing to done. The two child stories (`settings-global`, `configure-mode-append`) are now unblocked.
