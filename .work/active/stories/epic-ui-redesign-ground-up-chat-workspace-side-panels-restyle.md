---
id: epic-ui-redesign-ground-up-chat-workspace-side-panels-restyle
kind: story
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up-chat-workspace
depends_on: [epic-ui-redesign-ground-up-design-system-token-swap]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Chat workspace side panels — three-column layout

## Scope

Three-column layout per the locked Refined Bubbles mock:
- Left (240px): document list.
- Center: session.
- Right (280px): concepts + sidekick.

Use the existing `resizable-side-panel-hook` pattern; new layout
tokens come from `tokens.css`.

## Implementation steps

1. Edit `packages/ui/src/routes/chat.tsx` (or the equivalent shell
   route) to mount three-column layout.
2. Restyle each side panel component to the new tokens.
3. Per-panel resize hooks (left + right) using
   `useResizableWidth({ storageKey, defaultWidth, minWidth, maxWidth, side })`.
4. Tests covering layout + resize persistence.
5. Quality checks green.

## Acceptance criteria

- [ ] Three-column layout renders with the locked tokens.
- [ ] Each panel resizes and persists.
- [ ] All quality checks green.
