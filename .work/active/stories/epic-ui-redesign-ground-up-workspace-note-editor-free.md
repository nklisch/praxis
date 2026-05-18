---
id: epic-ui-redesign-ground-up-workspace-note-editor-free
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

- [ ] Typewriter page renders with drop-cap.
- [ ] Slash commands surface inline structure.
- [ ] Gutter shows word count + read time + tags.
- [ ] All quality checks green.
