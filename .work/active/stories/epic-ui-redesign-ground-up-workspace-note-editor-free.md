---
id: epic-ui-redesign-ground-up-workspace-note-editor-free
kind: story
stage: done
tags: [ui]
parent: epic-ui-redesign-ground-up-workspace
depends_on: [epic-ui-redesign-ground-up-design-system-token-swap]
release_binding: v0.1.3
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Free note editor — typewriter page + slash commands + drift tags

## Scope

Rewrite the free note editor per
`.mockups/screens/.../-workspace/note-free-editor.html`:
- Minimal chrome typewriter page.
- Full-bleed title input; drop-cap on first paragraph.
- Slash-command for inline structure.
- Right gutter (fixed): word count + read time + drifted concept tags.

## Implementation steps

1. New `packages/ui/src/components/note-editor-free.{tsx,module.css}`.
2. Contenteditable editor with slash-command menu (Lexical / TipTap).
3. Drop-cap CSS on first paragraph.
4. Right gutter component reading derived state.
5. Tests cover slash-command + gutter render.
6. Quality checks green.

## Acceptance criteria

- [x] Typewriter page renders with drop-cap.
- [x] Slash commands surface inline structure.
- [x] Gutter shows word count + read time + tags.
- [x] All quality checks green.

## Implementation notes

Rewrote `note-editor-free.{tsx,module.css}` from scratch:

**Component architecture**
- `NoteEditorFree` now accepts optional `title`/`onTitleChange`/`conceptTags` props
  alongside the existing `body`/`onChange` pair. Props are optional so the
  existing call-site in `note-editor-page.tsx` compiles without changes.
- Body stored as plain text (`body.text`); seeded into contenteditable once on
  mount via `innerHTML` (paragraphs split on double-newlines). Subsequent edits
  read back via `textContent`.

**Drop-cap**
- Contenteditable div (not `<textarea>`) so `::first-letter` CSS pseudo-element
  can target `.bodyEditor > p:first-child::first-letter`. Float-left, 4.5em,
  italic, accent colour — exact match to the mock.

**Slash-command menu**
- Detects `/` at the start of the current line by inspecting `window.getSelection()`
  caret position on every `onInput` event.
- Filters `SLASH_COMMANDS` list by prefix match; shows a `role="listbox"` overlay.
- Arrow keys navigate; Enter/Tab applies; Escape dismisses.
- Applying a command replaces the current paragraph's text with the appropriate
  Markdown-style prefix (`# `, `> `, `- `, etc.) and moves the caret to end.
- Menu dismissed with 150 ms delay on blur so `mousedown` on a menu item fires
  before blur clears state.

**Right gutter**
- Fixed-position 220px aside — three panels matching the mock exactly:
  "This note" (words + read time at 200 wpm), "Concepts drifted in" (tag chips),
  and the `⌘ /` hint panel with accent-muted background.
- Word count and read time derived from `statsText` state updated on every input.

**Tests** (9 tests, all green)
- Title renders + onChange fires.
- Body editor is a contenteditable div (drop-cap CSS targeting confirmed).
- Gutter shows correct word count (5 words → "5" + "~1 min").
- Concept tags appear/hidden based on prop.
- Slash-menu opens on `/` input; Escape dismisses it.
- `onChange` fires with updated text on input.

**Quality**: `pnpm biome check` clean on all three files; 1270/1270 tests pass.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none

**Important**: none

**Nits**:
- The gutter uses `position: fixed` inside an `overflow-y: auto` scroll container (`.editorBody`). Fixed elements anchor to the viewport rather than the scroll container, so the gutter stays visible while scrolling — this is the stated design intent ("fixed-position 220px aside") and matches the mock. Worth a comment in the CSS to make the intent explicit for future editors.

**Notes**: Implementation is clean and well-structured. `escapeHtml` correctly sanitises body text before setting `innerHTML`. The `seededRef` / one-way-seeding pattern is appropriate for an uncontrolled contenteditable. Slash command detection (`detectSlashContext`) handles the prefix-match filter correctly; `noUncheckedIndexedAccess` safety at `slashCommands[slashIdx]` is guarded. No foundation-doc drift — UX.md's "plain text for resistance to the system's preferences" description of the Free format is additive to, not contradicted by, the typewriter/drop-cap/slash-command enhancements. Tests cover the behavioural contract (gutter stats, slash menu open/dismiss, onChange propagation). 1270 tests pass.
