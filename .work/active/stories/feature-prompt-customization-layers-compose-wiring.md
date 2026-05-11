---
id: feature-prompt-customization-layers-compose-wiring
kind: story
stage: implementing
tags: [content, core]
parent: feature-prompt-customization-layers
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-11
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
