---
id: feature-editorial-polish-pass-theme-tokens
kind: story
stage: implementing
tags: [ui]
parent: feature-editorial-polish-pass
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-12
updated: 2026-05-12
---

# Light-mode CSS tokens via `prefers-color-scheme`

## Scope

Story 1 of `feature-editorial-polish-pass`. Foundation: add a
`@media (prefers-color-scheme: light)` block in `packages/ui/src/styles/global.css`
defining light-mode equivalents for every `--color-*` variable, plus a quick
audit of the nav bar (`nav.tsx` + `nav.module.css`) to ensure it uses tokens
rather than hardcoded colors.

Auto-switching only — no manual toggle UI in v1. The OS-level system theme
preference drives the switch.

## Files to touch

- `packages/ui/src/styles/global.css` — add the light-mode media query block.
- `packages/ui/src/components/nav.module.css` — replace any hardcoded colors with tokens (the existing dark-mode default colors already use tokens for most of the values; verify).
- `packages/ui/src/__tests__/theme-tokens.test.tsx` (new) — smoke test asserting `<Nav>` renders without error and the global stylesheet has matching tokens.

## Acceptance criteria

- [ ] `@media (prefers-color-scheme: light) { :root { ... } }` block exists in `global.css` with light values for: `--color-bg`, `--color-surface`, `--color-border`, `--color-text`, `--color-text-muted`, `--color-accent`, `--color-user-bubble`, `--color-assistant-bubble`.
- [ ] `nav.module.css` has zero hardcoded hex colors (every color comes from a token).
- [ ] Dark-mode visual baseline unchanged — `:root` values stay as they are.
- [ ] Existing `pnpm --filter @praxis/ui test` green; the new smoke test green.

## References

- Design: `.work/active/features/feature-editorial-polish-pass.md` (Story 1)
- Current tokens: `packages/ui/src/styles/global.css`
- Nav bar: `packages/ui/src/components/nav.tsx` + `nav.module.css`

<!-- Implementation Notes accumulate here as work progresses. -->
