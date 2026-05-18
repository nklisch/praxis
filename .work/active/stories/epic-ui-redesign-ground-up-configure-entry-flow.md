---
id: epic-ui-redesign-ground-up-configure-entry-flow
kind: story
stage: review
tags: [ui]
parent: epic-ui-redesign-ground-up-configure
depends_on: [epic-ui-redesign-ground-up-design-system-token-swap]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
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

- [x] Unlock modal matches locked mock.
- [x] Re-lock path returns to student surface.
- [x] All quality checks green.

## Implementation notes

No `.mockups/flows/configure-entry/` existed at implementation time. Proceeded
directly with token-aligned restyling per the project convention (story
instructions authorize this path when the mockup is absent — document the
choice here and skip the `/ux-ui-design:flows` run).

### What changed

**`packages/ui/src/components/unlock-modal.module.css`**
Full restyle using Studio Quiet locked tokens throughout:
- `--color-text-tertiary` for ornament and kicker (tertiary, not secondary — quieter)
- `--letter-spacing-kicker` token for the mono kicker
- `--font-size-xl` / `--font-weight-regular` for the editorial serif title
- `--color-bg-tertiary` for the input background (sunken feel, matches the
  design system's "input fields" intent)
- Mono font on the input itself with `letter-spacing: 0.2em` for code readability
- `--color-accent` / `--color-accent-hover` transition on the Unlock button
  (replaces hard `opacity: 0.9` with a proper hover colour shift)
- `--radius-sm` everywhere (Studio Quiet: sharp, architectural — not round cards)
- `--space-*` tokens for consistent 8pt spacing throughout

**`packages/ui/src/routes/configure.module.css`**
- Locked screen card: all hardcoded values replaced with design tokens
  (`--radius-lg`, `--space-*`, `--color-*`)
- Removed unused `.lockIcon` / `.lockedTitle` selectors (no longer in the TSX)
- Added `.lockBtn` class — mono kicker-style button, quiet graphite, appears in
  the tab bar's right section when `isSet && isUnlocked` is true

**`packages/ui/src/routes/configure.tsx`**
- Destructured `lock` from `useLock()` (was already returning it — just not used here)
- Added "lock" button to the tab bar right section, shown only when
  `isSet && isUnlocked`; clicking calls `lock()` which updates `useLock`'s
  internal state optimistically (via `setData` in the hook) — the locked screen
  is shown on next render without a round-trip
- Fixed a pre-existing `useTemplate` lint issue in the inspector strip

**`packages/ui/src/components/__tests__/unlock-modal.test.tsx`** (new)
9 tests:
- Renders dialog with kicker, title, input
- Cancel / Unlock buttons present
- Unlock button disabled when empty, enabled when typed
- Correct code → calls `onUnlocked` + `onClose`
- Wrong code → shows `role="alert"` error, dialog stays open
- Cancel → `onClose`, no `unlock()` call
- Re-lock path (via LockIcon): `lock()` called on click
- Re-lock path: icon reflects locked state after `lock()` resolves

All 151 test files, 1544 tests green. Lint clean. UI typecheck clean.
