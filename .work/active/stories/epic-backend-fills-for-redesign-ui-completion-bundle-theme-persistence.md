---
id: epic-backend-fills-for-redesign-ui-completion-bundle-theme-persistence
kind: story
stage: review
tags: [ui]
parent: epic-backend-fills-for-redesign-ui-completion-bundle
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Theme persistence — auto / light / dark toggle

## Scope

- `useTheme()` hook reading + writing localStorage key
  `praxis.theme.preference` (values: `"auto" | "light" | "dark"`).
- On mount, restore preference; set `data-theme` attribute on
  `<html>` accordingly (none for `auto`, `"light"` / `"dark"` for
  explicit).
- `<ThemeToggle>` component — a 3-state button rendered in the app
  shell status strip per the locked app-shell mock.
- Default to `"auto"` when no stored preference; respects
  `prefers-color-scheme` for the auto branch (already handled by
  `tokens.css`).

## Implementation steps

1. New `packages/ui/src/hooks/use-theme.ts`:
   ```ts
   type ThemePref = "auto" | "light" | "dark";
   export function useTheme(): { pref: ThemePref; setPref: (p: ThemePref) => void };
   ```
   - Read from localStorage on mount; default `"auto"`.
   - On `setPref`: write to storage; apply `data-theme` to `<html>`
     for explicit values, remove for `"auto"`.

2. New `packages/ui/src/components/theme-toggle.tsx`:
   - 3-button group (auto / light / dark) calling `setPref`.
   - Matches the mock copy and styling from
     `.mockups/screens/.../-app-shell/option-3.html`.

3. Mount the toggle in the app shell status strip (in
   `router.tsx` or the equivalent root layout).

4. Tests:
   - `use-theme.test.ts` covering storage roundtrip + attribute
     application + auto-default.
   - `theme-toggle.test.tsx` covering 3 buttons + onClick.

5. `pnpm typecheck && pnpm lint && pnpm test` green.

## Acceptance criteria

- [ ] User's choice persists across reloads.
- [ ] `data-theme` attribute on `<html>` matches choice (or absent
      when `"auto"`).
- [ ] Toggle UI renders in the app shell.
- [ ] All quality checks green.

## Implementation notes

Delivered `useTheme` hook and `<ThemeToggle>` component (hook + component
story only — mounting in the app shell is handled by the sibling
`-theme-toggle-mount` story).

**`packages/ui/src/hooks/use-theme.ts`**
- `ThemePref = "auto" | "light" | "dark"`, storage key `praxis.theme.preference`.
- Initial pref read and `applyToDocument` called synchronously inside the
  `useState` initializer so the attribute is set before first paint where
  possible.
- `useEffect([pref])` keeps `data-theme` in sync whenever pref changes.
- `setPref` writes localStorage then updates state; `applyToDocument` is
  called via the effect for clean separation.
- `localStorage` access wrapped in try/catch for SSR / restricted contexts.

**`packages/ui/src/components/theme-toggle.tsx` + `.module.css`**
- `<fieldset>` + visually-hidden `<legend>` for semantic grouping (Biome
  `useSemanticElements` rule).
- 3 `<button type="button">` with `aria-pressed`, separated by `·` spans.
- Active button highlighted via `--color-accent` underline + colour, matching
  the locked option-3.html mock exactly.
- Tokens: `var(--font-mono)`, `var(--letter-spacing-kicker)`,
  `var(--color-text-secondary)`, `var(--color-accent)`.

**Tests** — 14 tests, all green:
- `use-theme.test.ts` (7): default auto, mount attribute removal, setPref
  light/dark/auto, storage roundtrip, restore on mount.
- `theme-toggle.test.tsx` (7): 3 buttons, aria-pressed default, click dark,
  click light, click auto to clear, localStorage persistence, separator glyphs.
