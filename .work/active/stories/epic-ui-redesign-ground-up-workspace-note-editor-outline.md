---
id: epic-ui-redesign-ground-up-workspace-note-editor-outline
kind: story
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up-workspace
depends_on: [epic-ui-redesign-ground-up-design-system-token-swap]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
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

- [ ] Keyboard shortcuts work as locked.
- [ ] Levels render per the locked styling.
- [ ] All quality checks green.
