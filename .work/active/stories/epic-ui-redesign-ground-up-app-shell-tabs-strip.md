---
id: epic-ui-redesign-ground-up-app-shell-tabs-strip
kind: story
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up-app-shell
depends_on:
  - epic-ui-redesign-ground-up-design-system-token-swap
  - epic-ui-redesign-ground-up-app-shell-root-layout-top-nav
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Open-tabs strip — italic deck-line typography next to nav

## Scope

Restyle the existing tab strip per the locked Index mock: italic
deck-line typography, dot separators, open/active/held visual states,
positioned next to the primary nav in the running head.

## Implementation steps

1. Edit `packages/ui/src/components/tab-strip.{tsx,module.css}`:
   - Replace block-style tabs with italic deck-line typography
     (`var(--font-serif)`, `font-style: italic`).
   - Dot-separator pattern: `Open · Calc · L3 · Quiz · deriv` per
     the mock.
   - Active / held / closed states styled per the mock.

2. Edit `router.tsx` to mount the tab strip in the running head
   between the surface links and the right-edge tools.

3. Tests covering rendering of multiple tabs, active state, and
   close-tab interaction.

4. `pnpm typecheck && pnpm lint && pnpm test` green.

## Acceptance criteria

- [ ] Tab strip renders as italic deck lines next to the surface
      nav per the locked mock.
- [ ] Active / held / closed states distinguishable.
- [ ] Existing tab-strip behavior (open / close / switch) preserved.
- [ ] All quality checks green.
