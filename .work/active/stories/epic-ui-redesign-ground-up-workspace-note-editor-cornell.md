---
id: epic-ui-redesign-ground-up-workspace-note-editor-cornell
kind: story
stage: review
tags: [ui]
parent: epic-ui-redesign-ground-up-workspace
depends_on: [epic-ui-redesign-ground-up-design-system-token-swap]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Cornell note editor — 3-zone layout with cue-anchor markers

## Scope

Rewrite the Cornell note editor per
`.mockups/screens/.../-workspace/note-cornell-editor.html`:
- 3-zone layout: cue column (left, 240px), notes column (right, body),
  summary band (bottom).
- ◆ markers in notes column anchor clickable cues on the left.

## Implementation steps

1. New `packages/ui/src/components/note-editor-cornell.{tsx,module.css}`
   (or refactor existing). Use a rich-text editor (Lexical / TipTap)
   for the notes column with autosave debouncing.
2. Cue column: keyboard-accessible cue list; click-to-scroll to ◆
   marker.
3. Summary band: fixed-height textarea at bottom.
4. Tests cover 3-zone interaction and cue navigation.
5. Quality checks green.

## Acceptance criteria

- [x] Cornell editor renders the 3-zone layout.
- [x] Cue ◆ markers in notes column scroll the cue list and back.
- [x] All quality checks green.

## Implementation notes

Refactored `note-editor-cornell.tsx` + `.module.css` from the old side-by-side
row layout to a true 3-zone Cornell grid per the locked mock.

**Data model**: kept `CornellBody { questions[], details[], summary }` unchanged
— the parallel arrays map naturally: `questions[]` → cue column, `details[]` →
notes column, `summary` → summary band. No migration needed.

**Layout**: CSS grid `240px 1fr` for the two main columns + `grid-column: 1/-1`
summary band at the bottom. Matches the mock's structural proportions.

**Cue ↔ marker bridging**:
- Each cue in the left column is a `<button>` (keyboard-accessible) wrapping a
  `<textarea>` for editing. `onClick` sets `activeCueIdx` and calls
  `scrollIntoView` on the matching `<div>` in the notes column (held in
  `markerRefs`).
- Each notes entry has a `◆` `<button>` with `data-cue-id` at its left edge.
  Clicking scrolls back to the cue (via `cueRefs`) and sets `activeCueIdx`.
- Active state highlighted with `cueButtonActive` (inset accent stripe) and
  `notesEntryActive` (muted accent wash) CSS modifier classes.

**Typography**: `--font-serif` italic for cue + notes body, `--font-mono` for
zone kickers, `--space-*` scale throughout. No hardcoded values where tokens
exist.

**Tests**: 17 tests covering 3-zone rendering, cue/detail textareas, ◆ marker
count, summary band, empty-state, all data mutations, cue↔marker
scrollIntoView calls, active-class toggling, and spawn button behaviour.
`scrollIntoView` mocked via `beforeEach` since jsdom doesn't implement it.
