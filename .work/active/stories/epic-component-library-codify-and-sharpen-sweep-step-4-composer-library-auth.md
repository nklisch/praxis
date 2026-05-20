---
id: epic-component-library-codify-and-sharpen-sweep-step-4-composer-library-auth
kind: story
stage: implementing
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
