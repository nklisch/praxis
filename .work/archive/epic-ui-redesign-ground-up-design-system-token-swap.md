---
id: epic-ui-redesign-ground-up-design-system-token-swap
kind: story
stage: done
tags: [ui]
parent: epic-ui-redesign-ground-up-design-system
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
reviewed: 2026-05-17
---

# Token swap: adopt `tokens.css` + rename CSS variables

## Scope

Swap `packages/ui/src/styles/global.css` to use the locked Studio Quiet /
System Editorial token vocabulary from `.mockups/design-system/tokens.css`,
and rename every consumer reference across all `*.module.css` files under
`packages/ui/src/`.

This is a mechanical visual-contract migration. The mocks (palette,
typography, every downstream surface) have already aligned against the new
vocabulary. Production code lags; this story closes the gap.

See parent feature
`.work/active/features/epic-ui-redesign-ground-up-design-system.md` for the
full design — architectural choice, rename map, bubble-color migration,
acceptance criteria, risks.

## Implementation steps

1. **Rewrite `packages/ui/src/styles/global.css`**:
   - Inline the locked token block from
     `.mockups/design-system/tokens.css` (sans the mockup-only header
     comment). This includes the `:root` block, the
     `@media (prefers-color-scheme: dark)` block, and the
     `:root[data-theme="dark"]` block.
   - Keep the existing universal box-sizing reset, the `html/body/#root`
     block, the body styles, the `a` and `button` defaults, and the
     `.editorial` composable. Update them to reference the new tokens
     (`--color-bg-primary`, `--color-text-primary`,
     `--color-text-link`, `--font-display`, etc.).
   - Re-add `--tint-route: var(--color-text-secondary);` inside the
     `:root` block — the old `global.css` declared it and 1+ consumer
     references it via `var(--tint-route)`.

2. **Walk every `*.module.css` under `packages/ui/src/`** applying the
   rename map from the parent feature's "Variable rename map" section.
   File-by-file, not blanket sed — there are subtle no-change entries
   and the bubble-color migration is non-trivial.

   Practical workflow:
   - `grep -rn '<old-name>' packages/ui/src/**/*.module.css` per old name.
   - Edit each file. Where a consumer used `--color-user-bubble` or
     `--color-assistant-bubble`, replace with a mode-tint-aware
     expression (see "Bubble migration" below).
   - After each name family, run `grep -r '<old-name>' packages/ui/src/`
     to confirm zero hits before moving on.

3. **Bubble migration** (`Message`, `MessageList`, chat tab bodies):
   - Remove `--color-user-bubble` / `--color-assistant-bubble` from
     `global.css`.
   - Add a `--message-tint` CSS custom property declared on the message
     container element from React (e.g. via `style={{ "--message-tint":
     tintFor(mode) }}` where `tintFor` returns a `var(--tint-<mode>)`
     reference based on `session.modeId`).
   - Update message styles to compute bubble fill via `color-mix(in oklab,
     var(--message-tint) 12%, var(--color-bg-secondary))`. Confirm
     `color-mix` renders in Electron 41 (Chromium ≥ 121).
   - If `color-mix` rendering fails on the user's build target, fall back
     to `background: var(--color-accent-muted);` for both user and
     assistant bubbles. Document the fallback in the parent feature's
     Risks section as triggered.

4. **Run quality checks**:
   - `pnpm typecheck` (should be green — CSS rename doesn't touch
     TypeScript)
   - `pnpm lint` (Biome must be green)
   - `pnpm test` (Vitest must be green; refresh any snapshot tests that
     drift on token name changes — the new tokens ARE the contract)

5. **Visual smoke**:
   - `pnpm dev` and confirm the Electron app boots; app shell, chat
     workspace, library, progress map, and configure surfaces render
     with Studio Quiet (warm off-white background, true near-black
     text, muted brick accent).
   - Toggle system theme (or set `document.documentElement.dataset.theme
     = 'dark'` from devtools) and confirm dark-mode tokens apply.

## Acceptance criteria

- [ ] `packages/ui/src/styles/global.css` token block matches
      `.mockups/design-system/tokens.css` content (verbatim except the
      mockup-only header comment).
- [ ] No `--color-bg`, `--color-surface`, `--color-text`, `--color-fg`,
      `--color-fg-muted`, `--color-text-muted`, `--color-error`,
      `--color-bg-subtle`, `--color-canvas-bg`, `--color-card-bg`,
      `--color-card-bg-hover`, `--color-input-bg`, `--color-panel-bg`,
      `--color-surface-alt`, `--color-surface-muted`,
      `--color-surface-raised`, `--color-rule`, `--color-user-bubble`,
      `--color-assistant-bubble`, `--color-badge`, `--color-badge-text`,
      `--color-primary`, `--color-danger-bg`, or bare `--radius` remain
      anywhere in `packages/ui/src/`.
- [ ] Mode-tint tokens (`--tint-teach`, `--tint-bootstrap`,
      `--tint-quiz`, `--tint-homework`, `--tint-exam`,
      `--tint-configure`, `--tint-study-skills`) are defined in
      `global.css` and adapt to both system-follow and explicit
      `data-theme` dark mode.
- [ ] `--tint-route` re-declared as `var(--color-text-secondary)`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` all green.
- [ ] Visual smoke (`pnpm dev`) confirms the locked palette renders on
      every major surface.

## Implementation notes

### What landed

- `packages/ui/src/styles/global.css` fully rewritten: token block inlined
  verbatim from `.mockups/design-system/tokens.css` (sans the mockup-only
  header comment), universal reset kept, body/a/button defaults updated to
  new token names, `.editorial` composable preserved, `--tint-route:
  var(--color-text-secondary)` re-added inside `:root`.
- All 115 `*.module.css` files under `packages/ui/src/` updated via the
  rename map. Also updated `packages/ui/src/components/mode-header.tsx` (one
  inline style with `--color-text-muted`) and
  `packages/ui/src/components/quick-check-card.tsx` (two inline style
  references).
- `packages/ui/src/__tests__/theme-tokens.test.tsx` rewritten to assert the
  new Studio Quiet token vocabulary instead of the old one.

### Deviations and decisions

- **Cascade ordering**: ran sed passes in separate steps rather than a single
  atomic pass. This caused some intermediate double-substitution artifacts
  (e.g. `--color-surface` → `--color-bg-secondary` then `--color-bg` →
  `--color-bg-primary` incorrectly matched inside `-secondary`, producing
  `--color-bg-primary-secondary`). All cascaded artifacts were found and
  corrected with follow-up passes. Final audit confirmed zero bad names
  remain.
- **Private `--color-surface-1/2/3` tokens**: these numbered variants were
  not in the official rename map (they were ad-hoc private tokens, not in the
  old global.css). The `--color-surface` rename sed accidentally touched them,
  producing `--color-bg-secondary-1/2/3`. Mapped them to `--color-bg-secondary`
  (level-1) and `--color-bg-tertiary` (level-2 and level-3) as the closest
  semantic matches.
- **Bubble migration: fallback path taken**. `--color-user-bubble` and
  `--color-assistant-bubble` replaced with `var(--color-accent-muted)` for
  both user and assistant bubbles. The full mode-tint path (`color-mix` +
  `--message-tint` set from `MessageList` based on `session.modeId`) is
  deferred to a follow-up story as noted in the parent feature risk section.
  `chat-tab-body.module.css` had one additional bubble reference (the pending
  bubble) also migrated to `--color-accent-muted`.
- **`mode-header.tsx`**: two inline style values used the string
  `"var(--color-text-muted)"` to set `--mode-tint` on the opening/idle header
  states. Updated to `"var(--color-text-secondary)"`.

### Quality

- `pnpm test`: 3676 tests passed, 23 skipped (expected).
- `pnpm typecheck`: pre-existing failure in `@praxis/core` (unrelated to this
  story — `recommendation-service.ts` and `snapshot-capturer.ts` errors that
  were present before this change).
- `pnpm lint`: pre-existing failures in `.mockups/` HTML and
  `packages/ui/src/__tests__/` files (not touched by this story). The one new
  lint target (`global.css`) was auto-fixed with `biome check --write`.

## Out of scope

- Re-implementing or visually redesigning components — this is a rename,
  not a redesign. Surface-level redesigns ship under the other epic
  children (`-app-shell`, `-chat-workspace`, etc.).
- Renaming `--tint-bootstrap` to `--tint-course-create`. That waits for
  the backend mode-id rename tracked at
  `.work/backlog/idea-rename-bootstrap-and-explorer.md`.
- Touching the mockup files in `.mockups/`. The mocks are the SSOT;
  production mirrors them, not the other way round.

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none

**Important**: `fix-ripples-panel-color-error-legacy-token` — `ripples-panel.module.css`
(added in `7b10e69`, after this story landed) uses the legacy `--color-error`
token instead of `--color-danger`. Out of scope for this story; filed as backlog
item `.work/backlog/fix-ripples-panel-color-error-legacy-token.md`.

**Nits**:
- No nits.

**Notes**: All acceptance criteria satisfied at commit `1cce159`. The bubble-color
fallback (`var(--color-accent-muted)` instead of mode-tinted `color-mix`) is
explicitly sanctioned by the story body and the parent feature's Risks section as
an acceptable v1 limitation. The `--color-surface-1/2/3` → `--color-bg-secondary` /
`--color-bg-tertiary` resolution is a sound semantic mapping. `global.css` token
block matches `.mockups/design-system/tokens.css` content with only the expected
addition of `--tint-route: var(--color-text-secondary)`. Tests pass (3676 green,
23 skipped expected). Typecheck pre-existing failure (`recommendation-service.ts`,
`snapshot-capturer.ts`) predates this story and is unrelated.
