---
id: epic-component-library-codify-and-sharpen-sweep-step-2-item-bodies
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

# Step 2 — Sweep `components/item-bodies/` (status-tint migration)

## Brief

Migrate the six item-body CSS modules off raw `rgba(...)` status tints
onto `var(--color-*)` ± `color-mix(...)` (or new
`--color-success-soft` / `--color-error-soft` tokens if needed). These
modules drive the answered / selected / correct / incorrect visual
states students see during quizzes, homework, and exams.

## Files in scope

- `packages/ui/src/components/item-bodies/item-body-shared.module.css`
- `packages/ui/src/components/item-bodies/matching-body.module.css`
- `packages/ui/src/components/item-bodies/numerical-body.module.css`
- `packages/ui/src/components/item-bodies/ordering-body.module.css`
- `packages/ui/src/components/item-bodies/reasoning-textarea.module.css`
- `packages/ui/src/components/item-bodies/two-tier-body.module.css`

## Current state

Verified 2026-05-20:

- 0/6 files declare `composes: ... editorial from global`
- 21 `rgba(...)` literals (heaviest in `matching-body` with 10, `ordering-body` with 6)
- 0 bare px in `padding`/`margin`/`gap`
- The rgba values are status tints — typically `rgba(96, 165, 250, 0.08)` (info
  blue), `rgba(74, 222, 128, 0.08)` (success green), `rgba(248, 113, 113, 0.08)`
  (error red), plus their `0.5`-alpha border variants

## Target state

- Every rgba status tint resolves through `var(--color-success)`,
  `var(--color-error)`, `var(--color-info)` (or whatever Studio Quiet
  status tokens are named in `tokens.css`) combined with
  `color-mix(in srgb, var(--color-X) 8%, transparent)`
- Where `color-mix` is needed in many places per file, prefer adding
  `--color-success-soft` / `--color-error-soft` / `--color-info-soft`
  tokens to `tokens.css` and referencing them (contract refinement,
  expected per the parent epic's decomposition risks)
- The content shells compose `editorial from global` where they render
  editorial body text

## Implementation notes

- Apply the translation table from step-1
- Visual parity is the bar — the answered/correct/incorrect states must
  look indistinguishable from current to students mid-quiz
- If `color-mix` doesn't render correctly in any browser target the desktop
  app supports, fall back to dedicated `-soft` tokens

## Acceptance criteria

- [ ] `pnpm build && pnpm typecheck && pnpm test` green
- [ ] `grep -rnE '\b(rgb|rgba)\(' --include='*.module.css' packages/ui/src/components/item-bodies | wc -l` returns `0`
- [ ] Visual parity check: render matching-body with each status
      (default / correct / incorrect / selected) and confirm against
      pre-sweep screenshots — log result in story body
- [ ] Any new `--color-*-soft` tokens added to `tokens.css` are noted in
      story body and back-referenced in the contract feature for awareness

## Risk

Medium. The status tints carry pedagogical meaning — if a student sees
the "correct" tint wash for an incorrect answer because alpha math went
sideways, that's a real comprehension bug, not just a visual nit.
Mitigation: visual parity check is mandatory.

## Rollback

`git revert <commit>` — single-area scope.
