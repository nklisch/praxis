---
id: epic-ui-redesign-ground-up-workspace-ask-tutor-from-note
kind: story
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up-workspace
depends_on:
  - epic-ui-redesign-ground-up-design-system-token-swap
  - epic-backend-fills-for-redesign-ui-completion-bundle-spawn-from-note
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
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

- [ ] CTA appears on Cornell + Feynman cues.
- [ ] Click spawns a teach session with the cue pre-injected.
- [ ] Parent prompt acknowledges briefed-from-note context.
- [ ] All quality checks green.
