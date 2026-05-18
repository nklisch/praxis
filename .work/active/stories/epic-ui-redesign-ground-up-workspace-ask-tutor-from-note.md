---
id: epic-ui-redesign-ground-up-workspace-ask-tutor-from-note
kind: story
stage: done
tags: [ui]
parent: epic-ui-redesign-ground-up-workspace
depends_on:
  - epic-ui-redesign-ground-up-design-system-token-swap
  - epic-backend-fills-for-redesign-ui-completion-bundle-spawn-from-note
release_binding: v0.1.3
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Ask-tutor-from-note brief preparation surface

## Scope

Per the locked `note-to-tutor-brief` flow:
- "▶ talk to Praxis about this" CTA on unfinished note cues.
- Briefed-session opening pattern (already supported by
  `spawnFromNote` from sibling backend story).
- Post-conversation: tutor offers to update the note's cue with the
  earned answer.

## Implementation steps

1. Add the CTA button to Cornell + Feynman editors (any editor with
   explicit cues).
2. Wire to `praxisClient.sessions.spawnFromNote({ noteId, cueId })`
   and open the new session tab via `session-tab-open-flow`.
3. Update parent prompt fragment (teach mode) to handle the
   briefed-from-note opening turn — the parent prompt should
   reference the cue and offer to update the note at conversation end.
4. Tests cover the button + spawn flow.
5. Quality checks green.

## Acceptance criteria

- [x] CTA appears on Cornell + Feynman cues.
- [x] Click spawns a teach session with the cue pre-injected.
- [x] Parent prompt acknowledges briefed-from-note context.
- [x] All quality checks green.

## Implementation notes

**Land-mode audit**: the sibling `spawn-from-note` story had already landed:
- `NoteEditorCornell`: `▶` spawn button per cue row, gated on `onSpawnFromCue` prop.
- `NoteEditorFeynman`: `▶` spawn button per follow-up, gated on `onSpawnFromCue` prop.
- `note-editor-page.tsx`: `handleSpawnFromCue` → `client.session.spawnFromNote({ noteId, cueId })` → `client.tabs.open` → navigate. Disables buttons while spawning (`spawning` guard).
- Tests in `note-editor-cornell.test.tsx` and `note-editor-feynman.test.tsx`: button visibility + click callback coverage fully present.
- `spawnFromNote` backend: wraps cue text in `<note-cue>` and detail in `<note-body>` tags as the opening user message.

**Added in this story**: the teach-mode prompt had no guidance about `<note-cue>` tags or the post-conversation note-update offer. Added:
- `packages/curriculum/src/modes/fragments/note-brief-awareness.ts` — new `context`-position fragment that tells the tutor to: (1) open by addressing the `<note-cue>` directly, (2) use `<note-body>` to read the student's existing mental model, (3) stay focused on the cue, (4) offer `note.update` at session close.
- `teach.ts`: fragment added after `behaviorInCourseFragmentDefault.teach`.
- `packages/curriculum/src/modes/fragments/__tests__/note-brief-awareness.test.ts`: 9 tests (shape + template content + teach-mode inclusion).
- `packages/curriculum/src/__tests__/teach-mode.test.ts`: updated fragment count assertion (10 → 11) and added id assertion for `context.note-brief-awareness`.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- `CLAUDE.md` "Where the big pieces live" still only references `spawnFromAssignment`, not `spawnFromNote` or `spawnFromPassage`. Pre-existing gap — not introduced here.

**Notes**: Narrowly-scoped and correct. The `noteBriefAwarenessFragment` is at `position: "context"` which is a valid slot in `FRAGMENT_ORDER`. The `<note-cue>` / `<note-body>` tags documented in the fragment match exactly what `spawnFromNote` injects in `session-service.ts`. The `note.update` tool referenced in the fragment is in `teach.ts` `toolNames`. 9 tests cover shape + content assertions + teach-mode inclusion. No foundation-doc drift.
