---
id: epic-ui-redesign-ground-up-workspace-review-session-flow
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

# Review-session flow rebuild

## Scope

Rebuild the review-session flow (queue → card → outcome → next-card
→ session-end summary).

Prerequisite: a `.mockups/flows/review-session/` mockup pass produces
the locked direction. If absent, run `/ux-ui-design:flows` first.

## Implementation steps

1. If `.mockups/flows/review-session/` absent: run
   `/ux-ui-design:flows review-session` and get sign-off.
2. Rebuild `review-session.tsx` per the locked flow:
   - Queue surface with start CTA.
   - Per-card surface with answer band + outcome buttons.
   - Next-card transition animation.
   - Session-end summary card.
3. Tests cover the full flow.
4. Quality checks green.

## Acceptance criteria

- [ ] Flow walks through queue → cards → end.
- [ ] Session-end summary surfaces.
- [ ] All quality checks green.
