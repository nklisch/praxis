---
id: epic-ui-redesign-ground-up-chat-workspace-document-tab-body-restyle
kind: story
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up-chat-workspace
depends_on: [epic-ui-redesign-ground-up-chat-workspace-chat-shell-refined-bubbles]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Document tab body — read-mostly viewer restyle

## Scope

Restyle `DocumentTabBody` per the locked `mode-document.html` mock:
read-mostly viewer chrome.

Citation highlights + selection bar + scope-aware "ask Praxis" land
via sibling
`epic-backend-fills-for-redesign-document-viewer` stories; this
story is the surface layout restyle.

## Implementation steps

1. Edit `packages/ui/src/components/document-tab-body.{tsx,module.css}`.
2. Apply locked layout: clean reading column, generous margins,
   editorial typography from tokens.css.
3. Tests cover the restyle.
4. Quality checks green.

## Acceptance criteria

- [ ] Document tab body matches the locked mock visual contract.
- [ ] Per-format renderers continue to dispatch correctly.
- [ ] All quality checks green.
