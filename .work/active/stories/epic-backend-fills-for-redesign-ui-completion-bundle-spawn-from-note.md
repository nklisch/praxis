---
id: epic-backend-fills-for-redesign-ui-completion-bundle-spawn-from-note
kind: story
stage: done
tags: []
parent: epic-backend-fills-for-redesign-ui-completion-bundle
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# `spawnFromNote(noteId, cueId?)` + workspace button

## Scope

- New `SessionService.spawnFromNote({ studentId, noteId, cueId? })`
  parallel to `spawnFromAssignment`.
- Note-editor button "▶ talk to Praxis about this" that calls the
  spawn.

## Implementation steps

1. Service:
   - Edit `packages/core/src/services/session-service.ts`.
   - Add `spawnFromNote({ studentId, noteId, cueId? })`. Pattern
     mirrors `spawnFromAssignment` (around line 510+):
     - Resolve the note + cue text.
     - Create a new teach session.
     - Inject the cue + surrounding context into the parent agent's
       opening turn (e.g.,
       `<note-cue>...</note-cue><note-body>...</note-body>` block).
     - Return the new session id.

2. IPC + client:
   - Channel `praxis.sessions.spawnFromNote` (envelope-wrapped, Zod
     schema).
   - Client method on `praxisClient.sessions.spawnFromNote(...)`.

3. UI:
   - For each note editor that surfaces unfinished cues (Feynman,
     Cornell), add a "▶ talk to Praxis about this" button next to
     each cue.
   - On click: call spawn, then open the new session in a tab via
     `session-tab-open-flow`.

4. Tests:
   - Service integration: spawn → assert session has the cue text
     in the opening turn.
   - UI button click → fake spawn called with correct args.
   - IPC harness test.

5. `pnpm typecheck && pnpm lint && pnpm test` green.

## Acceptance criteria

- [x] `spawnFromNote` returns a working teach session with the cue
      pre-injected.
- [x] Workspace note editors surface the spawn button on cues.
- [x] IPC + client end-to-end works against the IPC harness.
- [x] All quality checks green.

## Implementation notes

### Service (`SessionServiceImpl.spawnFromNote`)
Added to `packages/core/src/services/session-service.ts` after `spawnFromAssignment`.
- Resolves `studentId` via `getOrCreateDefaultStudentId` if not supplied (so the
  IPC handler can omit it — consistent with all `notes.*` channels).
- Parses the note body to extract the cue: `followUps[idx]` for feynman notes,
  `questions[idx]` for cornell, `root.text` for outline, raw `text` for free.
- Wraps cue + body in `<note-cue>…</note-cue>` / `<note-body>…</note-body>` XML tags.
- Calls `start({ modeId: "teach" })` then drains the first `send()` turn to seed
  the session transcript; turn failure is non-fatal (session still returns).
- Returns the `SessionHandle` from `start()`.

### IPC channel (`praxis.session.spawnFromNote`)
Added to `packages/desktop/electron/main/ipc-server.ts` alongside
`praxis.session.spawnFromAssignment`. Zod schema: `{ noteId, cueId? }`.
`studentId` resolved server-side via `services.getDefaultStudentId()`.

### Client (`SessionClient.spawnFromNote`)
Added to `packages/client/src/services/session-client.ts`. Accepts `{ noteId, cueId? }`.
Interface method added to `SessionService` in `packages/core/src/types/client.ts` with
optional `studentId?` so `SessionServiceImpl` accepts it but `SessionClient` doesn't
need to pass it.

### UI buttons
- `NoteEditorFeynman`: optional `onSpawnFromCue` prop; `▶` button rendered next to
  each follow-up item when the prop is provided.
- `NoteEditorCornell`: same pattern; `▶` button next to each question row, wrapped
  in a `rowActions` div.
- `NoteEditorPage`: wires `handleSpawnFromCue` — calls `client.session.spawnFromNote`,
  then `client.tabs.open`, then `navigate` to `/chat/$tabId`. Disabled during
  in-flight spawn (`spawning` state).

### Tests
- 5 service integration tests in `session-service-spawn-from-note.test.ts`.
- 7 IPC harness tests in `spawn-from-note-channel-envelope.test.ts`.
- 4 new UI tests appended to `note-editor-cornell.test.tsx` and
  `note-editor-feynman.test.tsx` (3 each).
- Full suite: 3883 tests pass.

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- Duplicate JSDoc block before `spawnFromNote` in `packages/core/src/types/client.ts` (two consecutive `/** ... */` comments) — fixed inline.
- `sessionId as any` cast at `session-service.ts:629` with an inaccurate biome-ignore comment ("engine send is async-iterable; drain it" doesn't explain the `any`). `handle.sessionId` is already `SessionId` so the cast is a no-op. Matches the same pattern used in `spawnFromPassage` (line 722); clean up when that area is next touched.

**Notes**: Commit 706a422 bundles a small scope bleed: `ConfidenceBand` import and `confidence?` on `AssignmentResponseInput` in `client.ts`, plus the matching IPC schema extension in `ipc-server.ts`, belong to the sibling `quiz-confidence` story. Both stories share the same parent feature and the quiz-confidence commit landed after, so there's no correctness problem — the changes are consistent. The `openSessionInTab` helper is not reused here (appropriate: that helper calls `session.start`, not `spawnFromNote`; manual chaining is correct).
