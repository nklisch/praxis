---
id: feature-refactor-session-service-spawn-extraction-step-3-spawn-from-note
kind: story
stage: implementing
tags: [refactor]
parent: feature-refactor-session-service-spawn-extraction
depends_on: [feature-refactor-session-service-spawn-extraction-step-2-spawn-from-assignment]
release_binding: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 3: Move `spawnFromNote` into `SessionSpawner`

## What
Move the body of `SessionServiceImpl.spawnFromNote` into
`SessionSpawner.spawnFromNote`. The method on `SessionServiceImpl` becomes a
one-line delegate.

## Why
`spawnFromNote` is the most complex of the three: it parses note body JSON,
extracts cue text by format (feynman/cornell/outline/free), composes an opening
message, and injects it via `send()`. Extracting it after step 2 validates that
`sendMessage` port works correctly.

## Files touched
- `packages/core/src/services/session/session-spawner.ts` — add `spawnFromNote`
  method
- `packages/core/src/services/session-service.ts` — replace body with delegate
- `packages/core/src/__tests__/session-service-spawn-from-note.test.ts` — no
  structural changes; calls via `svc.spawnFromNote(...)` on `SessionServiceImpl`
  which delegates to spawner

## Current state
`spawnFromNote` is ~95 lines inline in `SessionServiceImpl` (lines 663–756).
It:
1. Resolves `studentId` (falls back to default)
2. Loads note row; throws if missing
3. Parses note body JSON (`parseNoteBody`) by format
4. Extracts `cueText` and `noteBodyText` per format
5. Composes `openingMessage` with `<note-cue>` / `<note-body>` XML tags
6. Calls `this.start({ modeId: "teach", _persistImmediately: true })`
7. Drains `this.send(sessionId, openingMessage)` fire-and-forget
8. Returns `handle`

## Target state
All logic above lives in `SessionSpawner.spawnFromNote`. Deps needed:
- `deps.db` — note row lookup
- `deps.log` — `spawn_from_note.opening_turn_failed` warn
- `deps.startSession` — teach session open
- `deps.sendMessage` — opening turn injection

`SessionServiceImpl.spawnFromNote` becomes:
```ts
async spawnFromNote(input: {
  studentId?: StudentId;
  noteId: NoteId;
  cueId?: string;
}): Promise<SessionHandle> {
  return this.spawner.spawnFromNote(input);
}
```

Imports moved from `session-service.ts` to `session-spawner.ts`:
- `notes` from `@praxis/artifacts/schema`
- `parseNoteBody` from `../../types/index.js`
- `getOrCreateDefaultStudentId` from `../student.js` (already moved in step 2)
- `and`, `eq` from `drizzle-orm` (already imported in spawner from step 2)

## Implementation notes
- The `biome-ignore lint/suspicious/noExplicitAny: engine send is async-iterable;
  drain it` comment on the `send()` call can be dropped: inside `SessionSpawner`,
  `deps.sendMessage(sessionId, openingMessage)` is already typed correctly as
  `(sessionId: SessionId, message: string) => AsyncIterable<EngineEvent>` from
  the deps interface, so no cast needed.
- `studentId` fallback logic (`input.studentId ?? getOrCreateDefaultStudentId(...)
  as StudentId`) moves verbatim.
- The `parseNoteBody` call is inside a try/catch that silently swallows parse
  failures — preserve exactly.
- After moving, check whether `notes` and `parseNoteBody` imports can be removed
  from `session-service.ts` (they can if no other method uses them).

## Acceptance
- `pnpm typecheck && pnpm lint && pnpm test` all green.
- `session-service-spawn-from-note.test.ts` all cases pass.
- The `biome-ignore` cast comment is gone from the spawner (clean API via
  `deps.sendMessage`).

## Rollback
Revert spawner additions; restore original body in `session-service.ts`.
