---
id: epic-ui-redesign-ground-up-configure-gates-tab-canvas
kind: story
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up-configure
depends_on: [epic-ui-redesign-ground-up-configure-canvas-side-chat-shell]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Configure Gates tab canvas — React Flow polish

## Scope

Polish the gates-tab React Flow gate graph per the locked mock:
- Edge labels showing mastery thresholds.
- Warning-coloured edges for unsaved threshold changes.
- Inspector integration: selected node's fields surface in the
  shell's inspector strip.

## Implementation steps

1. Edit `packages/ui/src/routes/configure/gates-tab.tsx`.
2. Apply locked tokens to the React Flow theme.
3. Edge-label component shows mastery threshold.
4. Warning-coloured edge variant for dirty thresholds.
5. Inspector strip wiring.
6. Tests cover edge label rendering + dirty edge variant.
7. Quality checks green.

## Acceptance criteria

- [ ] Gates tab matches the locked mock.
- [ ] Edge labels and warning state render correctly.
- [ ] All quality checks green.
