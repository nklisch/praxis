---
id: epic-ui-redesign-ground-up-workspace-chat-to-workspace-inline-panel
kind: story
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up-workspace
depends_on:
  - epic-ui-redesign-ground-up-design-system-token-swap
  - epic-ui-redesign-ground-up-workspace-note-editor-cornell
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Chat → workspace inline-panel infrastructure

## Scope

Mid-session insight capture per the locked
`chat-to-workspace-note` flow:
- Format-picker popover (Cornell suggested first, numbered shortcuts).
- Inline Cornell panel slides in from right (replaces concepts panel
  temporarily).
- Saved + linked to lesson.

## Implementation steps

1. New `<NoteFormatPicker>` popover triggered from the chat composer
   verb rail.
2. New inline note panel infrastructure: panel mounted in the
   chat-workspace right column with slide-in animation; replaces
   concepts panel temporarily.
3. On save: persists note via `praxisClient.notes.create` with
   `contextJson.sessionId` set; closes panel; surfaces toast.
4. Tests cover the popover + panel lifecycle.
5. Quality checks green.

## Acceptance criteria

- [ ] Format picker appears on composer verb click.
- [ ] Inline Cornell panel slides in, saves, closes.
- [ ] Saved notes appear in catalogue with "from this session"
      filter.
- [ ] All quality checks green.
