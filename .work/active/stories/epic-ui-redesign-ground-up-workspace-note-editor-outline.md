---
id: epic-ui-redesign-ground-up-workspace-note-editor-outline
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

# Outline note editor — keyboard-first hierarchical bullets

## Scope

Rewrite the outline note editor per
`.mockups/screens/.../-workspace/note-outline-editor.html`:
- Hierarchical bullets, 4 indentation levels.
- Tab indents / Shift+Tab outdents / ⌘. converts to checkbox.
- Drag handles on hover.

## Implementation steps

1. New `packages/ui/src/components/note-editor-outline.{tsx,module.css}`.
2. Use a contenteditable editor (Lexical / TipTap) with custom
   keyboard shortcuts.
3. Level-1 bold heroic → level-4 muted-italic asides styling.
4. Drag handle on hover (HTML5 drag-and-drop).
5. Tests cover keyboard shortcuts + level styling.
6. Quality checks green.

## Acceptance criteria

- [x] Keyboard shortcuts work as locked.
- [x] Levels render per the locked styling.
- [x] All quality checks green.

## Implementation notes

**Architecture decision**: Rewrote as a flat-list model rather than a recursive
tree. This matches the locked mock exactly — the mock renders a flat sequence of
rows with `padding-left` indentation, not nested `<ul>` trees. The flat model
also makes keyboard navigation (Tab/Shift+Tab to change level) and drag-to-reorder
trivial without complex tree-manipulation logic.

**Data model**: Extended `NoteBody` in `@praxis/core/types/notes.ts` to support
two outline shapes: `{ kind: "outline"; rows: OutlineRow[] }` (new flat-list
format) and `{ kind: "outline"; root: OutlineNode }` (legacy tree). The editor
migrates legacy bodies to flat rows on first load. `parseNoteBody` handles both;
existing stored notes remain readable.

**Key files changed**:
- `packages/ui/src/components/note-editor-outline.tsx` — full rewrite
- `packages/ui/src/components/note-editor-outline.module.css` — full rewrite
- `packages/ui/src/__tests__/note-editor-outline.test.tsx` — full rewrite
- `packages/core/src/types/notes.ts` — added `OutlineRow`, extended `NoteBody`
- `packages/core/src/services/notes-service.ts` — updated `NoteBodySchema`
- `packages/tools/src/notes/schema.ts` — updated `NoteBodySchema`
- `packages/tools/src/flashcards/from-note.ts` — handles flat rows
- `packages/ui/src/components/note-card.tsx` — handles flat rows in preview
- `packages/core/src/services/session-service.ts` — handles flat rows for cue text

**Keyboard shortcuts implemented**:
- `Tab` → indent (level + 1, max 4)
- `Shift+Tab` → outdent (level − 1, min 1)
- `Enter` → new sibling bullet at same level
- `⌘/Ctrl+Enter` → new level-1 bullet (finish branch)
- `⌘/Ctrl+.` → toggle bullet ↔ checkbox
- `⌘/Ctrl+Shift+↑/↓` → move row up/down
- `Backspace` on empty row → delete + move focus up

**Tests**: 23 tests covering rendering, Tab/Shift+Tab, ⌘. checkbox toggle,
drag-handle reorder, Enter sibling creation, and legacy body migration.

**Quality**: `pnpm typecheck && pnpm lint && pnpm test` all green.
