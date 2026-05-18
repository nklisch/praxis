---
id: epic-ui-redesign-ground-up-workspace-note-editor-cornell
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

- [ ] Cornell editor renders the 3-zone layout.
- [ ] Cue ◆ markers in notes column scroll the cue list and back.
- [ ] All quality checks green.
