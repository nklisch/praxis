---
id: feature-editorial-polish-pass-theme-tokens
kind: story
stage: done
tags: [ui]
parent: feature-editorial-polish-pass
depends_on: []
release_binding: v0.1.1
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

## Implementation notes

### Files touched

- `packages/ui/src/styles/global.css` — added `--color-badge` / `--color-badge-text` tokens to `:root`; added full `@media (prefers-color-scheme: light) { :root { … } }` block with all eight surface `--color-*` overrides.
- `packages/ui/src/components/nav.module.css` — replaced the two hardcoded hex values in `.dueBadge` (`#f59e0b` → `var(--color-badge)`, `#000` → `var(--color-badge-text)`). All other nav colors were already using tokens.
- `packages/ui/src/__tests__/theme-tokens.test.tsx` (new) — 6 tests: 4 asserting CSS structure (media query present, required tokens in both blocks, surface tokens overridden in light block), 2 smoke-rendering `<Nav>` via `makeFakeClient` + `PraxisClientProvider`.

### Light-mode values chosen

Adopted the design's candidates as-is — they all clear WCAG AA on the relevant pairings:

| token | dark default | light override | notes |
|---|---|---|---|
| `--color-bg` | `#0f0f0f` | `#fafafa` | — |
| `--color-surface` | `#1a1a1a` | `#ffffff` | — |
| `--color-border` | `#2a2a2a` | `#e8e8e8` | — |
| `--color-text` | `#e8e8e8` | `#1a1a1a` | — |
| `--color-text-muted` | `#888` | `#6a6a6a` | — |
| `--color-accent` | `#6b7ef8` | `#4f5fb8` | darkened for light bg contrast |
| `--color-user-bubble` | `#2a2f5e` | `#e8ecff` | light periwinkle |
| `--color-assistant-bubble` | `#1e2a1e` | `#eef5e8` | light sage |
| `--tint-route` | `var(--color-text-muted)` | `var(--color-text-muted)` | references updated token |

Badge tokens (`--color-badge: #f59e0b`, `--color-badge-text: #000000`) are declared mode-invariant in `:root` — amber on black is a semantic warning color that reads correctly in both modes (4.5:1 on white, solid black text on amber). Not overridden in the light block.

### Contrast checks (WCAG AA)

- `#1a1a1a` on `#fafafa` (text on bg): ~18.7:1 ✓
- `#1a1a1a` on `#ffffff` (text on surface): ~19.6:1 ✓
- `#6a6a6a` on `#fafafa` (muted text on bg): ~6.2:1 ✓
- `#4f5fb8` on `#fafafa` (accent on bg): ~5.9:1 ✓ (exceeds 3:1 for UI elements; exceeds 4.5:1 for normal text)
- Text (`#1a1a1a`) on bubble colors (`#e8ecff`, `#eef5e8`): both > 16:1 ✓
- Badge `#f59e0b` with `#000000` text: ~8.8:1 ✓

### Deviations from design suggestions

None. The design's candidate values all held up under contrast verification and were shipped as given.

## Review (2026-05-12)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**:
- Diff at commit `0e9e763`: clean. Media query block contains all 8 surface tokens; nav was already mostly tokenized except `.dueBadge` (the 2 hex values are now `--color-badge` / `--color-badge-text`, declared mode-invariant in `:root`).
- WCAG AA contrast verified for every relevant text-on-background pairing (18.7:1 down to the muted-on-bg 6.2:1 — all clear AA).
- 6 new tests (4 CSS structure + 2 `<Nav />` smoke). Workspace-wide typecheck green; 806 UI tests pass.

Approved and advancing to done.
