---
id: epic-ui-redesign-ground-up-workspace-note-editor-outline
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

## Review findings (2026-05-18)

**Stage set back to: implementing**

### Blockers

1. **`dangerouslySetInnerHTML` cursor reset** (`packages/ui/src/components/note-editor-outline.tsx` line 446): `dangerouslySetInnerHTML={{ __html: escapeHtml(row.text) }}` on the `contentEditable` div resets the cursor whenever the user types `&`, `<`, `>`, or `"`. `escapeHtml` produces a different string than the raw DOM content, React detects the diff and overwrites the node, losing the selection. Fix: set initial text via `ref` only on mount (`el.textContent = row.text` when `!el.textContent`); remove `dangerouslySetInnerHTML` and `escapeHtml`. Tracked in `.work/active/stories/fix-outline-editor-contenteditable-cursor-reset.md`.

2. **`CONTRACT.md` drift** (`docs/CONTRACT.md` line 1125): outlined `NoteBody` still showed the old `root`-only shape. Fixed inline — updated to show the new dual-optional shape plus `OutlineRow` definition.

### Important

3. **`z.discriminatedUnion` → `z.union` regression** (`packages/core/src/services/notes-service.ts` line 79, `packages/tools/src/notes/schema.ts` line 37): dropping to `z.union` for the entire `NoteBodySchema` to handle two same-kind outline shapes is a minor performance regression (O(n) vs O(1) scan). The outline ambiguity can instead be modeled as a single branch with both fields optional, restoring `z.discriminatedUnion`. Tracked in `.work/backlog/refactor-note-body-schema-restore-discriminated-union.md`.

### Nits

- `normaliseBody(body)` called twice in `useState` initializer (lines 104–105). Cache the result in one call.
- The `useState` comment "React does not control contentEditable value" is partially misleading — React does reconcile `dangerouslySetInnerHTML`; the comment is only true after the blocker fix removes it.

## Review (2026-05-18)

**Verdict**: Request changes

**Blockers**: `fix-outline-editor-contenteditable-cursor-reset`, `CONTRACT.md` drift (fixed inline)
**Important**: `refactor-note-body-schema-restore-discriminated-union`
**Nits**: double `normaliseBody` call in useState; stale comment about contentEditable control

## Re-review note

Sibling fix story `fix-outline-editor-contenteditable-cursor-reset` cleared
the contenteditable cursor-reset blocker. No code changes needed in this
story body. Re-advanced to review for verdict pass 2.

## Review 2 (2026-05-18)

**Verdict**: Approve

**Blockers**: none (all pass-1 blockers resolved)
**Important**: none (z.union backlog item still tracked in `.work/backlog/refactor-note-body-schema-restore-discriminated-union.md`)
**Nits**: double `normaliseBody` call in useState initializer still present — acceptable for now

**Notes**: Both pass-1 blockers resolved. `dangerouslySetInnerHTML` removed in `fix-outline-editor-contenteditable-cursor-reset` (cursor-reset fix approved). `CONTRACT.md` drift fixed inline in pass-1 response. Stale comment about "React does not control contentEditable" gone with the removal of `dangerouslySetInnerHTML`. 28 tests pass including 5 new regression tests for special-character input. Bounce count: 1 — only one prior bounce, no new blockers found.
