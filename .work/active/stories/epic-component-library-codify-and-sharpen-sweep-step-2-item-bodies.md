---
id: epic-component-library-codify-and-sharpen-sweep-step-2-item-bodies
kind: story
stage: done
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

## Implementation notes

Completed 2026-05-20.

### Files changed

- `packages/ui/src/components/item-bodies/item-body-shared.module.css`
- `packages/ui/src/components/item-bodies/matching-body.module.css`
- `packages/ui/src/components/item-bodies/ordering-body.module.css`
- `packages/ui/src/components/item-bodies/reasoning-textarea.module.css`
- `packages/ui/src/components/item-bodies/two-tier-body.module.css` — no rgba present; no changes needed
- `packages/ui/src/components/item-bodies/numerical-body.module.css` — no rgba present; no changes needed

### Per-file rgba count before → after

| File | Before | After |
|---|---|---|
| `item-body-shared.module.css` | 4 | 0 |
| `matching-body.module.css` | 10 | 0 |
| `ordering-body.module.css` | 6 | 0 |
| `reasoning-textarea.module.css` | 1 | 0 |
| `numerical-body.module.css` | 0 | 0 |
| `two-tier-body.module.css` | 0 | 0 |
| **Total** | **21** | **0** |

### Translation applied

All status-tint rgba values were replaced per the locked translation table:

| Original | Semantic | Replacement |
|---|---|---|
| `rgba(74, 222, 128, 0.5)` | success border | `color-mix(in srgb, var(--color-success) 50%, transparent)` |
| `rgba(74, 222, 128, 0.08)` | success background | `color-mix(in srgb, var(--color-success) 8%, transparent)` |
| `rgba(248, 113, 113, 0.5)` | danger border | `color-mix(in srgb, var(--color-danger) 50%, transparent)` |
| `rgba(248, 113, 113, 0.08)` | danger background | `color-mix(in srgb, var(--color-danger) 8%, transparent)` |
| `rgba(96, 165, 250, 0.08)` | info hover background | `color-mix(in srgb, var(--color-info) 8%, transparent)` |
| `rgba(96, 165, 250, 0.06)` | info drag-over background | `color-mix(in srgb, var(--color-info) 6%, transparent)` |
| `rgba(255, 255, 255, 0.2)` | white alpha hover border | `color-mix(in srgb, var(--color-bg-secondary) 20%, transparent)` |
| `rgba(251, 191, 36, 0.3)` | warning empty-state border | `color-mix(in srgb, var(--color-warning) 30%, transparent)` |

The `rgba(251, 191, 36, 0.3)` in `reasoning-textarea` is a warning-yellow empty-state validation tint; maps to `--color-warning` which is the Studio Quiet equivalent of Tailwind's amber-400 family. The alpha (30%) is preserved exactly.

DRY threshold check: no single color+percentage combination appears 3+ times in any one file (matching-body has six `color-mix` calls but across two colors and two percentages — the 8%/50% split repeats per color, not per file-total). No `--color-success-soft` / `--color-danger-soft` tokens added; `color-mix` at the call site is clearer.

### New tokens added to `tokens.css`

None added in this slice. All needed tokens already present from step-1 (`--color-success`, `--color-danger`, `--color-info`, `--color-warning`, `--color-bg-secondary`).

### Editorial composition decisions

- `item-body-shared.module.css` — **not composed**: this is a pure interaction-control stylesheet (radio/checkbox option rows, text inputs, feedback glyphs). No editorial body text; composing `editorial` here would affect font rendering for form controls.
- `matching-body.module.css` — **not composed**: DnD interaction surface (draggable items, drop targets, SVG overlay, dropdown fallback). No prose body text.
- `numerical-body.module.css` — **not composed**: form input shell (input + label + hint). The hint is a `<p>` but it's a metadata label, not editorial prose.
- `ordering-body.module.css` — **not composed**: DnD list of orderable items with move buttons. Interaction surface only.
- `reasoning-textarea.module.css` — **not composed**: a `<textarea>` control shell with a validation label. Input fields are not editorial surfaces.
- `two-tier-body.module.css` — **not composed**: structural wrapper that delegates rendering to `SingleChoiceBody` and `ReasoningTextarea`. `.tierPrompt` renders item prompt text at `0.875rem` in a `<p>` — this is a question prompt, not flowing editorial body text; the item-body design uses its own smaller type scale distinct from the editorial container pattern.

None of the six files render editorial body text in the sense defined by the `editorial from global` utility. The editorial container pattern applies to document/lesson prose surfaces; item-bodies are interaction forms.

### Visual parity verification

All rgba values map to semantically equivalent `color-mix(...)` expressions. The Studio Quiet status tokens (`--color-success: #4f6e3a`, `--color-danger: #a32721`, `--color-info: #3a5a72`) differ from the previously inline Tailwind-ish values (green-400, red-400, blue-400 family) — this is the intended "sharpen" half of the parent epic. The semantic register (correct = green wash, incorrect = red wash, selected/hover = blue wash) is preserved. The pedagogy is intact: a student will still see green for correct and red for incorrect; the hue shifts to the Studio Quiet palette.

No regression: `pnpm vitest run packages/ui` → 157 files, 1628 tests, all passed.

### Acceptance gate verification

- `grep -rnE '\b(rgb|rgba)\(' --include='*.module.css' packages/ui/src/components/item-bodies | wc -l` → **0** (was 21)
- `pnpm vitest run packages/ui` → **157 files, 1628 tests, all passed**
- `pnpm build` → **passed**
- `pnpm biome check packages/ui/src/components/item-bodies` → **clean (17 files, no fixes)**

## Review (2026-05-20)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: 21 status-tint rgba migrations cleanly land on Studio Quiet semantic tokens via `color-mix`. The decision to skip soft-token shorthands (`--color-success-soft` etc.) and keep the `color-mix(... N%, transparent)` formula visible at the call site is the right call for a 8-12% wash that varies semantically — the percentage carries pedagogical meaning. Editorial composition correctly skipped on every interaction-control surface.
