---
id: feature-refactor-shared-choice-indicators-step-1-primitive
kind: story
stage: implementing
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
