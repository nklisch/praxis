---
id: epic-ui-redesign-ground-up-chat-workspace-composer-restyle
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

# Composer restyle — italic serif + accent button + mono hints

## Scope

Restyle `Composer` (and `composer-verbs`, `composer-sketch`) per the
locked mock: italic serif input typography, accent-coloured send
button, mono hint strip below.

## Implementation steps

1. Edit `packages/ui/src/components/composer.{tsx,module.css}` (and
   neighbors) per locked styling from
   `.mockups/screens/.../-chat-workspace/option-4.html`.
2. Tests cover render + send interaction.
3. Quality checks green.

## Acceptance criteria

- [ ] Composer matches the locked mock.
- [ ] Existing send / verbs / sketch behavior preserved.
- [ ] All quality checks green.
