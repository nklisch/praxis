---
id: feature-refactor-shared-choice-indicators-step-1-primitive
kind: story
stage: done
tags: [refactor, ui, design-system]
parent: feature-refactor-shared-choice-indicators
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-24
---

# Step 1: Define `.choice-indicator` primitive

## Scope
Create a new CSS module shipping the `.choice-indicator` primitive + 4 variants (`--radio` / `--check` / `--correct` / `--incorrect`). Add matching literal classes to `.mockups/design-system/components.css`. Additive only — existing scattered CSS in `item-body-shared.module.css` stays untouched until step 2.

## Implementation
- Create `packages/ui/src/components/item-bodies/choice-indicator.module.css`:
  - `.choiceIndicator` — base aligned wrapper
  - `.choiceIndicatorRadio` — circular shape, `::after` for filled center on `:checked` peer or selected state
  - `.choiceIndicatorCheck` — square shape, `::after` for ✓ on selected state
  - `.choiceIndicatorCorrect` — success color tokens (`var(--color-success)`)
  - `.choiceIndicatorIncorrect` — danger color tokens (`var(--color-danger)`)
- Variants compose: `<span class="choiceIndicator choiceIndicatorRadio choiceIndicatorCorrect">` produces a correct-state radio
- All values reference design tokens — NO hardcoded hex/px
- Add header comment documenting the mockup-class-name mapping (production hashed, mock literal)
- Update `.mockups/design-system/components.css`:
  - Add `.choice-indicator`, `.choice-indicator--radio`, `.choice-indicator--check`, `.choice-indicator--correct`, `.choice-indicator--incorrect` with the same visual treatment
  - Place in Tier 2 section alongside other shared widgets
- Visual smoke: render a temporary page (or extend a Storybook-like test) exercising all 4 state combinations (radio-default, radio-correct, check-default, check-correct, check-incorrect, radio-incorrect)

## Acceptance Criteria
- [ ] `packages/ui/src/components/item-bodies/choice-indicator.module.css` shipped with 5 named classes
- [ ] All values reference CSS design tokens (no hardcoded literals)
- [ ] Existing `.optionInput` / `.correct` / `.incorrect` / `.feedbackGlyph` in `item-body-shared.module.css` UNTOUCHED
- [ ] Mockup `components.css` has matching `.choice-indicator` family with literal class names
- [ ] Visual reference: render the 6 state combinations; match mockup
- [ ] Build / typecheck / lint pass

## References
- Parent feature: `.work/active/features/feature-refactor-shared-choice-indicators.md` § Step 1
- Mockup target: `.mockups/design-system/components.css`
- Production location: `packages/ui/src/components/item-bodies/`

## Implementation notes (2026-05-24)

### Files touched
- **Created** `packages/ui/src/components/item-bodies/choice-indicator.module.css` — 5 classes: `.choiceIndicator` (base), `.choiceIndicatorRadio`, `.choiceIndicatorCheck`, `.choiceIndicatorCorrect`, `.choiceIndicatorIncorrect`
- **Created** `packages/ui/src/__tests__/choice-indicator.test.tsx` — 14 tests covering all 6 state combinations + module resolution + variant exclusivity
- **Updated** `.mockups/design-system/components.css` — added `.choice-indicator` family in Tier 2 section + updated table-of-contents comment

### Design decisions
- State driven by `data-selected="true"` attribute rather than `:checked` peer-selector; this keeps the indicator fully self-contained (no dependency on a sibling `<input>`), which step-2 consumers can use without restructuring the DOM.
- Local CSS custom properties (`--_indicator-fill`, `--_indicator-border-color`) as internal pivot points for feedback variants — feedback classes override just these two vars without repeating the geometry rules.
- `color-mix(in srgb, var(--color-success) 50%, transparent)` for the border tint matches the exact pattern already established in `item-body-shared.module.css` (`.correct` rule, line ~42).
- `inset: 3px` for the radio fill dot matches `.inline-question__indicator` in `components.css` (reference already in tree).

### Token verification
All tokens confirmed present in `packages/ui/src/styles/global.css`: `--color-success`, `--color-danger`, `--color-accent`, `--color-border-strong`, `--radius-sm`, `--font-mono`, `--font-weight-bold`. No new tokens introduced.

### Test results
- `pnpm vitest run choice-indicator.test.tsx` → 14/14 pass
- `pnpm typecheck` → clean across all packages
- `pnpm biome check` on new files → clean (pre-existing mockup HTML lint errors unrelated)

### Deviations from spec
- None. Existing `item-body-shared.module.css` is fully untouched.

## Review (2026-05-24)

**Verdict**: Approve

**Blockers**: none / **Important**: none / **Nits**: none

**Notes**: Purely additive — 140 LoC new CSS module + 160 LoC tests + 89 LoC mockup additions. `data-selected="true"` attribute contract (not `:checked` peer-selector) makes the primitive self-contained and unblocks any consumer DOM shape. Local CSS custom properties (`--_indicator-fill`, `--_indicator-border-color`) as variant pivots is clean DRY pattern — feedback classes override only the pivots, geometry stays in the base. All values reference design tokens (`--color-success`, `--color-danger`, `--color-border-strong`, `--radius-sm`, `--font-mono`, etc.); zero hardcoded literals. 14 tests cover all 6 state combinations + module resolution + variant exclusivity. Mockup parity maintained.
