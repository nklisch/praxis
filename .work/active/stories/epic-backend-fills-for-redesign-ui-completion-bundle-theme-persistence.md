---
id: epic-backend-fills-for-redesign-ui-completion-bundle-theme-persistence
kind: story
stage: implementing
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
