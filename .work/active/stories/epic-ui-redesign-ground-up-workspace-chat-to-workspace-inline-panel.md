---
id: epic-ui-redesign-ground-up-workspace-chat-to-workspace-inline-panel
kind: story
stage: review
tags: [ui]
parent: epic-ui-redesign-ground-up-workspace
depends_on:
  - epic-ui-redesign-ground-up-design-system-token-swap
  - epic-ui-redesign-ground-up-workspace-note-editor-cornell
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
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

- [x] Format picker appears on composer verb click.
- [x] Inline Cornell panel slides in, saves, closes.
- [ ] Saved notes appear in catalogue with "from this session"
      filter. (Catalogue filter is owned by sibling `-catalogue-rebuild` story.)
- [x] All quality checks green.

## Implementation notes

### Files added

- `packages/ui/src/components/note-format-picker-popover.tsx` + `.module.css` — new popover variant
  matching the locked flow mock (step 2/5): 5 formats, numbered shortcuts 1–5, Cornell suggested
  first, Esc dismisses, transparent backdrop closes on outside click.
- `packages/ui/src/components/inline-note-panel.tsx` + `.module.css` — slide-in panel
  (step 3/5): replaces the concepts panel in the right column, mounts `NoteEditorCornell`, saves
  via `client.notes.create({ context: { sessionId } })`, Esc dismisses, ⌘↵ saves.
- `packages/ui/src/components/saved-note-toast.tsx` + `.module.css` — bottom-right toast
  (step 4/5): auto-hides after 5 s, shows note title + format label, optional workspace link.

### Files modified

- `packages/ui/src/components/composer-verbs.tsx` — new `onNoteOpen` + `hasSessionNote` props;
  "+ note" button anchors a `NoteFormatPickerPopover` (local popover state, fires `onNoteOpen(format)`
  on selection).
- `packages/ui/src/components/chat-tab-body.tsx` — `TeachChatTabBodyProps` extended with
  `onNoteOpen` / `hasSessionNote`; threaded down to `ComposerVerbs`. `ChatTabBodyProps` extended
  similarly so `ChatRoute` can pass them.
- `packages/ui/src/routes/chat.tsx` — lifts `inlineNotePanel` + `hasSessionNote` + `savedToast`
  state; passes `onNoteOpen` to active tab's body; swaps the right column between `InlineNotePanel`
  and `ChatRightPanel`; renders `SavedNoteToast` after save; clears panel on active-tab switch.

### Architecture note

The format-picker popover is local state inside `ComposerVerbs` (positioned relative to the trigger
button). On selection it fires `onNoteOpen(format)` up to `ChatRoute`, which owns the panel state
and switches the right column. This keeps the popover anchored to its button without needing
a portal, while keeping the panel lifecycle at the layout level where it can swap the full right
column.

### Tests

- `__tests__/format-picker.test.tsx` — 13 tests: renders all 5 options, click selection,
  keyboard shortcuts 1–5, Esc, backdrop close, ARIA roles, suggested badge, alt action.
- `__tests__/inline-note-panel.test.tsx` — 8 tests: renders, title pre-fill, dismiss, Esc,
  save calls `notes.create` with correct args, `onSaved` callback, ⌘↵ save, "Saving…" state.
- `__tests__/chat-to-workspace-inline-panel.test.tsx` — 9 integration tests: full
  `ComposerVerbs` → format picker → `onNoteOpen` flow.

### Quality

- `pnpm --filter @praxis/ui typecheck` — passes (1 pre-existing error in `note-editor-page.tsx`
  unrelated to this story, present before these changes).
- `pnpm lint` (biome check on all new/modified files) — clean.
- `pnpm --filter @praxis/ui test` — 1463 tests pass (1433 pre-existing + 30 new).
