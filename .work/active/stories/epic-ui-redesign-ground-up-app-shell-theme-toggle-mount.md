---
id: epic-ui-redesign-ground-up-app-shell-theme-toggle-mount
kind: story
stage: done
tags: [ui]
parent: epic-ui-redesign-ground-up-app-shell
depends_on:
  - epic-ui-redesign-ground-up-design-system-token-swap
  - epic-ui-redesign-ground-up-app-shell-root-layout-top-nav
  - epic-backend-fills-for-redesign-ui-completion-bundle-theme-persistence
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Theme toggle — mount in the running head

## Scope

Mount the `<ThemeToggle>` component (from the sibling
`ui-completion-bundle-theme-persistence` story) at the right edge of
the running head per the locked Index mock.

## Implementation steps

1. Edit `packages/ui/src/router.tsx` (or the top-nav component) to
   render `<ThemeToggle>` at the right edge of the running head,
   matching the locked mock's positioning and typography.

2. Tests: `router.test.tsx` covers the toggle mount.

3. `pnpm typecheck && pnpm lint && pnpm test` green.

## Acceptance criteria

- [x] Theme toggle visible at the right edge of the running head.
- [x] Layout matches the locked mock.
- [x] All quality checks green.

## Implementation notes

Added a `themeSlot?: ReactNode` prop to `<TopNav>` alongside the existing
`tabsSlot` prop. This keeps the two slots distinct — the mock places the
theme toggle as a separate element at the true right edge, not nested inside
the tabs strip.

CSS: a new `.themeSlot` class in `top-nav.module.css` mirrors the mock's
`.theme-toggle` (border-left separator, baseline-aligned flex). The nav's
`flex: 1` expansion naturally pushes both slots to the right without needing
`margin-left: auto` on the slots.

`router.tsx` mounts `<ThemeToggle />` as `themeSlot` on `<TopNav>` in
`RootLayout`. The component is self-contained (calls `useTheme` internally) —
no extra props or wiring needed.

Tests: three new cases in `top-nav.test.tsx` assert (a) the three toggle
buttons render when `themeSlot` is provided, (b) they sit inside the
`<header>` (role=banner), and (c) they are absent when `themeSlot` is omitted.
All 12 TopNav tests and 7 ThemeToggle tests pass.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Minimal, correct implementation. `themeSlot` prop added alongside
`tabsSlot` keeps concerns distinct. CSS correctly relies on `nav { flex:1 }`
to push both slots right — no `margin-left: auto` needed on slots. Three new
TopNav tests cover presence/absence and containment in the running head.
No foundation-doc drift. Ship it.
