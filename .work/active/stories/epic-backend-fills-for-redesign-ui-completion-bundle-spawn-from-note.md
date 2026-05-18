---
id: epic-backend-fills-for-redesign-ui-completion-bundle-spawn-from-note
kind: story
stage: implementing
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

- [ ] `spawnFromNote` returns a working teach session with the cue
      pre-injected.
- [ ] Workspace note editors surface the spawn button on cues.
- [ ] IPC + client end-to-end works against the IPC harness.
- [ ] All quality checks green.
