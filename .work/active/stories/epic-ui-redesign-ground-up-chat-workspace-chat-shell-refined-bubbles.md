---
id: epic-ui-redesign-ground-up-chat-workspace-chat-shell-refined-bubbles
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

# Chat shell — Refined Bubbles base

## Scope

Convert `ChatTabBody` + `Message` to the locked Refined Bubbles
shape: drop bubble outlines; tutor turns on
`var(--color-bg-secondary)`; student turns right-aligned on
`var(--color-bg-tertiary)`; no borders. Sticky session-head with
kicker + title + progress bar. Preserve `tab-body-isolation`.

## Implementation steps

1. Edit `packages/ui/src/components/chat-tab-body.tsx` +
   `chat-tab-body.module.css`:
   - Apply the locked layout per `.mockups/screens/.../-chat-workspace/option-4.html`.
   - Three-column shell is added by the sibling `-side-panels-restyle`
     story; this story focuses on the center column + session-head.
2. Edit `packages/ui/src/components/message.{tsx,module.css}`:
   - Drop outlined-bubble styling.
   - User vs tutor differentiated by alignment + background tint.
3. New `packages/ui/src/components/session-head.{tsx,module.css}`:
   - Kicker (mode glyph + tint dot + mode label).
   - Italic title (session title).
   - Progress bar (where applicable).
4. Tests assert visual contract via snapshots + dom queries.
5. Quality checks green.

## Acceptance criteria

- [ ] `ChatTabBody` + `Message` match the Refined Bubbles mock.
- [ ] `<SessionHead>` renders kicker + title + progress bar.
- [ ] `tab-body-isolation` preserved.
- [ ] All quality checks green.
