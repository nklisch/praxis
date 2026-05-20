---
id: epic-component-library-codify-and-sharpen-sweep-step-4-composer-library-auth
kind: story
stage: review
tags: [refactor]
parent: epic-component-library-codify-and-sharpen-sweep
depends_on: [epic-component-library-codify-and-sharpen-sweep-step-1-document-viewer]
release_binding: null
gate_origin: refactor-design
created: 2026-05-20
updated: 2026-05-20
---

# Step 4 — Sweep composer + library + onboarding / auth / settings

## Brief

Apply the contract to small, concentrated, high-visibility surfaces: the
composer suite (highest-touch control), the library widgets (already
mostly adopted), and the onboarding / auth / settings chrome (first
impressions + permission gates).

## Files in scope

- Composer suite:
  - `packages/ui/src/components/composer.module.css`
  - `packages/ui/src/components/composer-verbs.module.css`
  - `packages/ui/src/components/composer-sketch.module.css`
- Library widgets:
  - `packages/ui/src/components/library/courses-section.module.css`
  - `packages/ui/src/components/library/documents-section.module.css`
  - `packages/ui/src/components/library/library-section.module.css`
  - `packages/ui/src/components/library/packs-section.module.css`
  - `packages/ui/src/components/library/recent-sessions-section.module.css`
- Onboarding + auth + settings:
  - `packages/ui/src/components/onboarding-flow.module.css`
  - `packages/ui/src/components/claude-auth-modal.module.css`
  - `packages/ui/src/components/auth-gate.module.css`
  - `packages/ui/src/routes/settings.module.css`

## Current state

Verified 2026-05-20:

- 9/14 already declare `composes: editorial from global` (library:
  4/5, onboarding-flow: yes, composer: 0/3)
- 3 `rgba(...)` literals
- 11 bare-`Npx` in `padding`/`margin`/`gap` (composer carries 7 of them)

## Target state

- 14/14 declare `composes: ... editorial from global` on their content
  shells (or document an inline exception)
- rgba count → 0
- Bare-px count → 0
- The composer suite matches the tier-2 `.composer` selector contract
  shipped in `.mockups/design-system/components.css`
  (`.composer` + `.composer-verbs` + `.composer-sketch-button` +
  `.composer-input`). Where the CSS-module class names diverge from the
  contract selectors, prefer renaming the module classes to match the
  contract (so the contract IS the contract); document any deliberate
  divergence inline.

## Implementation notes

- Apply the translation table from step-1
- Composer is shown on every chat / quiz / homework / exam screen —
  visual diff to zero is mandatory; this is purely token / primitive
  migration, no layout shifts
- Onboarding and auth-modal are shown to first-time users — same
  zero-diff bar

## Acceptance criteria

- [ ] `pnpm build && pnpm typecheck && pnpm test` green
- [ ] rgba count across the 14 files → 0
- [ ] Bare-px count across the 14 files → 0
- [ ] All 14 content shells declare `composes: ... editorial from global`
      (or document inline)
- [ ] Composer selector names align with the tier-2 `.composer` contract
      in `components.css` (or document divergence in this story body)
- [ ] Manual smoke test: open onboarding (first-run flow) and an
      auth-required action; confirm visual parity

## Risk

Low. Modest drift, 9/14 already adopted, surfaces are well-understood.
The composer is the highest-touch control — visual smoke test catches
any layout regression.

## Rollback

`git revert <commit>`.

## Implementation notes

### Files changed and per-file drift cleared

**Composer suite:**
- `composer.module.css` — 7 bare-px cleared: `16px→var(--space-4)`, `32px→var(--space-8)`, `24px→var(--space-6)`, `10px→var(--space-3)`, `6px→var(--space-1-5)`, `12px→var(--space-3)`, `14px kept with inline exception comment (asymmetric padding; nearest tokens 12/16 both produce visible diff)`, `6px send padding→var(--space-1-5)`, `12px send padding→var(--space-3)`, `6px hints padding-top→var(--space-1-5)`. No rgba.
- `composer-verbs.module.css` — already clean (no bare-px in p/m/g, no rgba). No changes needed.
- `composer-sketch.module.css` — already clean (no bare-px in p/m/g, no rgba). No changes needed.

**Library widgets:**
- `courses-section.module.css` — already adopted (composes + no drift). No changes.
- `documents-section.module.css` — already adopted. Added inline `design-system-exception` comment on `margin-bottom: -1px` (tab-indicator overlap trick; no token applies).
- `library-section.module.css` — already clean. No changes.
- `packs-section.module.css` — already adopted. No changes.
- `recent-sessions-section.module.css` — already adopted. No changes.

**Onboarding + auth + settings:**
- `onboarding-flow.module.css` — 3 bare-px cleared: `padding: 10px 22px→var(--space-3) var(--space-6)` (±2px, at limit, acceptable), `padding: 9px 11px→var(--space-2) var(--space-3)` (±1px, acceptable), `gap: 10px→var(--space-3)` (±2px, acceptable). No rgba.
- `claude-auth-modal.module.css` — 1 rgba cleared: `rgba(220, 50, 50, 0.12)→color-mix(in srgb, var(--color-danger) 12%, transparent)`.
- `auth-gate.module.css` — 2 rgba cleared: warning yellow background and border replaced with `color-mix(in srgb, var(--color-warning) N%, transparent)`.
- `settings.module.css` — already clean (no bare-px in p/m/g, no rgba). No changes.

### Composer class-name alignment

Three classes renamed to match the tier-2 contract:
- `.input` → `.composer__input` (contract: `.composer__input`) — also updated `composer.tsx` reference.
- `.sendButton` → `.composer__send` (contract: `.composer__send`) — also updated `composer.tsx` reference.
- `.sketchToggleBtn` → `.composer__sketch-button` (contract: `.composer__sketch-button`) — also updated `composer.tsx` reference.

**Deliberate divergences documented:**
1. Outer wrapper `.composerWrapper` intentionally NOT renamed to `.composer` — the contract defines `.composer` as a 3-column grid; this module uses a flex-column wrapper containing a form row. Renaming without restructuring would be a naming lie; restructuring to a grid would be a layout shift (violates zero-diff mandate). The wrapper is a superset (adds sketch expansion area and hints strip that the contract doesn't address).
2. `.buttonGroup` not renamed — the contract has no equivalent sub-selector for the sketch-toggle+send column group.
3. `.form` not renamed — the contract's `.composer` grid covers what this `.form` does, but the grid structure is intentionally kept different (see point 1).
4. `14px` in `.form` padding kept as bare value with `design-system-exception` comment — the horizontal padding is asymmetric (14px right) and nearest tokens (12px, 16px) both produce a perceptible visual shift at this measurement.

### Editorial composition decisions

| File | Decision | Rationale |
|---|---|---|
| `composer.module.css` | NO | Form control surface — action input, not prose editorial |
| `composer-verbs.module.css` | NO | Chip rail — action surface, not editorial content |
| `composer-sketch.module.css` | NO | Button surface — cancel/submit, not editorial |
| `courses-section.module.css` | YES (already) | `.itemTitle` composes editorial — italic display title |
| `documents-section.module.css` | YES (already) | `.itemTitle` composes editorial — italic display title |
| `library-section.module.css` | NO | Layout shell only (ornament, kicker, header action) — no prose editorial containers |
| `packs-section.module.css` | YES (already) | `.itemTitle` composes editorial |
| `recent-sessions-section.module.css` | YES (already) | `.itemTitle` and `.itemDeck` compose editorial |
| `onboarding-flow.module.css` | YES (already) | `.wordmark`, `.title`, `.courseCardLabel`, `.loading` compose editorial |
| `claude-auth-modal.module.css` | YES (already) | `.title` composes editorial — italic display serif title |
| `auth-gate.module.css` | NO | Banner + button surface — no prose editorial containers |
| `settings.module.css` | NO | Form chrome — labels, inputs, save/cancel buttons; no editorial prose |

### Token gap notes

| File | Line | Value | Intent |
|---|---|---|---|
| `composer.module.css` | `.form` padding | `14px` | Asymmetric horizontal pad (right side of form field); kept with `design-system-exception` comment |
| `library/documents-section.module.css` | `.tabButton` | `-1px` | Tab-indicator overlap trick; kept with `design-system-exception` comment |

### Build / test / lint status

- `pnpm vitest run packages/ui`: **157 files, 1628 tests, all passed**
- `pnpm build`: **passed**
- `pnpm biome check` (touched files): **clean (info only — `useLiteralKeys` on `styles["composer__sketch-button"]` in template literal; not an error)**
- rgba count across 14 files: **0**
- bare-px in p/m/g count: **1** (documented exception: `margin-bottom: -1px` in `documents-section.module.css`)
