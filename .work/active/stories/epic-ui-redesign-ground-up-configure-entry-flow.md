---
id: epic-ui-redesign-ground-up-configure-entry-flow
kind: story
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up-configure
depends_on: [epic-ui-redesign-ground-up-design-system-token-swap]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Configure entry / unlock flow polish

## Scope

Polish the configure-entry / unlock flow per
`.mockups/flows/configure-entry/`.

Prerequisite: a mockup pass if absent.

## Implementation steps

1. If `.mockups/flows/configure-entry/` is absent: run
   `/ux-ui-design:flows configure-entry`.
2. Rebuild `UnlockModal` per the locked direction.
3. Cover the re-lock path back to student surfaces.
4. Tests cover unlock + re-lock transitions.
5. Quality checks green.

## Acceptance criteria

- [ ] Unlock modal matches locked mock.
- [ ] Re-lock path returns to student surface.
- [ ] All quality checks green.
