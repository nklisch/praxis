---
id: epic-ui-redesign-ground-up-workspace-note-editor-feynman
kind: story
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up-workspace
depends_on:
  - epic-ui-redesign-ground-up-design-system-token-swap
  - epic-backend-fills-for-redesign-note-annotations-and-filters-annotations
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Feynman note editor — two-pass (writing / reviewing)

## Scope

Rewrite the Feynman note editor per locked variant D
(`note-feynman-editor-d-two-pass.html`):
- Mode toggle `I'm writing` ↔ `I'm reviewing`.
- Pass 1: clean writing surface; no gap-finding chrome.
- Pass 2: review mode — select text → attach margin note
  (severity "soft" yellow / "load_bearing" red).

Consumes annotations API from sibling story.

## Implementation steps

1. New `packages/ui/src/components/note-editor-feynman.{tsx,module.css}`.
2. Mode toggle component.
3. Pass 1: rich-text body editor; autosave.
4. Pass 2: selection → margin-note popover → `praxisClient.notes.setAnnotations`.
5. Render existing annotations in pass 2 as margin notes.
6. Tests cover both passes + annotation round-trip.
7. Quality checks green.

## Acceptance criteria

- [ ] Mode toggle switches surfaces.
- [ ] Pass 2 attaches margin notes with severity.
- [ ] Annotations persist + render on reload.
- [ ] All quality checks green.
