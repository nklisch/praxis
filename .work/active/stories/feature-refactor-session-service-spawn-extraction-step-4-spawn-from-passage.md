---
id: feature-refactor-session-service-spawn-extraction-step-4-spawn-from-passage
kind: story
stage: implementing
tags: [refactor]
parent: feature-refactor-session-service-spawn-extraction
depends_on: [feature-refactor-session-service-spawn-extraction-step-3-spawn-from-note]
release_binding: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 4: Move `spawnFromPassage` into `SessionSpawner`; tidy imports

## What
Move the body of `SessionServiceImpl.spawnFromPassage` into
`SessionSpawner.spawnFromPassage`. The method on `SessionServiceImpl` becomes a
one-line delegate. After all three moves, clean up any now-unused imports in
`session-service.ts`.

## Why
Completes the extraction. `spawnFromPassage` is the second-largest spawn method
(~95 lines) and is the only one that uses `documentScopes.attach` — exercising
the `deps.documentScopes` port from the deps interface.

## Files touched
- `packages/core/src/services/session/session-spawner.ts` — add `spawnFromPassage`
  method; all three spawn methods now live here
- `packages/core/src/services/session-service.ts` — replace body with delegate;
  remove now-unused imports (`documentChunks`, `documents`, `notes`,
  `parseNoteBody`, `assignments`, `asc` if no longer used elsewhere)
- `packages/core/src/services/__tests__/session-service.spawn-from-passage.test.ts` — no
  structural changes needed; tests call via `svc.spawnFromPassage(...)` on
  `SessionServiceImpl`

## Current state
`spawnFromPassage` is ~95 lines inline in `SessionServiceImpl` (lines 769–862).
It:
1. Resolves `studentId` (falls back to default)
2. Verifies document exists and belongs to student
3. Fetches all `documentChunks` in order; joins into `fullText`
4. Extracts passage with offset clamping + `MAX_PASSAGE_LENGTH = 100_000` cap
5. Logs a warning if passage was truncated
6. Composes `openingMessage` with `<passage>` XML tag
7. Calls `this.start({ modeId: "teach", _persistImmediately: true })`
8. Calls `documentScopes.attach(...)` with `passageRange`
9. Drains `this.send(sessionId, openingMessage)` fire-and-forget
10. Returns `handle`

## Target state
All logic above lives in `SessionSpawner.spawnFromPassage`. Deps needed:
- `deps.db` — document + chunk queries
- `deps.log` — passage-truncated warn, scope-attach-failed warn,
  opening-turn-failed warn
- `deps.startSession` — teach session open
- `deps.sendMessage` — opening turn injection
- `deps.documentScopes` — `attach(...)` call for passage range

`SessionServiceImpl.spawnFromPassage` becomes:
```ts
async spawnFromPassage(input: {
  studentId?: StudentId;
  documentId: DocumentId;
  range: { startOffset: number; endOffset: number };
}): Promise<SessionHandle> {
  return this.spawner.spawnFromPassage(input);
}
```

Imports moved from `session-service.ts` to `session-spawner.ts`:
- `documentChunks`, `documents` from `@praxis/artifacts/schema`
- `asc` from `drizzle-orm` (needed for chunk ordering)

Imports removed from `session-service.ts` after this step (verify each):
- `assignments` — moved in step 2; no longer used in session-service.ts
- `notes` — moved in step 3; no longer used in session-service.ts
- `documentChunks`, `documents` — moved in this step
- `parseNoteBody` — moved in step 3; no longer used in session-service.ts
- `asc` — moved in this step (verify `list()` uses `desc` not `asc`; it does)
- `NoteId` type — moved in step 3
- `DocumentId` type — moved in this step

## Implementation notes
- The `MAX_PASSAGE_LENGTH = 100_000` constant moves into the spawner as a
  module-level `const` (not exported) — same pattern used in `session-promoter.ts`
  for its module-local constants.
- The `deps.documentScopes` guard (`if (this.deps.toolServices.documentScopes)`)
  becomes `if (this.deps.documentScopes)` inside the spawner — simpler.
- The `biome-ignore lint/suspicious/noExplicitAny` cast on the `send()` call is
  removed — `deps.sendMessage` is fully typed.
- After cleaning `session-service.ts` imports, run `pnpm lint` to catch any
  missed stragglers.
- The `studentId` fallback pattern (`input.studentId ?? getOrCreateDefaultStudentId(...)
  as StudentId`) must be preserved verbatim — no change in semantics.
- The offset-clamping + cap logic (lines 801–810) must be preserved exactly —
  this is the "just shipped" logic that the feature constraint references.

## Acceptance
- `pnpm typecheck && pnpm lint && pnpm test` all green.
- `session-service.spawn-from-passage.test.ts` all cases pass.
- `session-service.ts` has no unused imports (lint would catch this).
- `session-spawner.ts` is the canonical home for all three `spawnFrom*` methods.
- `SessionServiceImpl` is ~210 lines shorter than before this feature started.

## Rollback
Revert spawner additions; restore original bodies in `session-service.ts`.
