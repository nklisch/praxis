---
id: feature-refactor-shared-choice-indicators-step-2-body-components
kind: story
stage: implementing
tags: [refactor, ui]
parent: feature-refactor-shared-choice-indicators
depends_on: [feature-refactor-shared-choice-indicators-step-1-primitive]
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-24
---

# Step 2: Refactor body components to use `.choice-indicator` primitive

## Scope
Update `single-choice-body.tsx` and `multi-select-body.tsx` to render via the new `.choice-indicator` primitive classes. Remove the now-unused `.correct` / `.incorrect` / `.feedbackGlyph` rules from `item-body-shared.module.css` (verified-no-other-consumers via grep).

## Implementation
- Edit `packages/ui/src/components/item-bodies/single-choice-body.tsx`:
  - `import indicatorStyles from "./choice-indicator.module.css"`
  - Replace label-level feedback class with indicator-level: render `<span class="choiceIndicator choiceIndicatorRadio [choiceIndicatorCorrect|choiceIndicatorIncorrect]">` alongside the `<input>` and `<label>`
  - Remove `.feedbackGlyph` span — primitive's `::after` handles the visual marker
  - Label no longer carries state-modifier classes; just base styling
- Edit `packages/ui/src/components/item-bodies/multi-select-body.tsx`:
  - Same refactor as single-choice but with `choiceIndicatorCheck` instead of `choiceIndicatorRadio`
- Edit `packages/ui/src/components/item-bodies/item-body-shared.module.css`:
  - Remove `.correct`, `.incorrect`, `.feedbackGlyph` (verify via grep no other production code references them)
  - Keep `.optionInput`, `.optionLabel` (still in active use)
- Run all tests; existing tests use semantic queries (`getByRole`) per audit — no selector updates expected
- Manual / visual regression: render identical items before-and-after; visuals should match

## Acceptance Criteria
- [ ] Both body components import + use `choice-indicator.module.css`
- [ ] `.correct` / `.incorrect` / `.feedbackGlyph` removed from `item-body-shared.module.css`
- [ ] No other production code references the removed classes (grep verification)
- [ ] All existing tests pass without modification:
  - `single-choice-body.test.tsx`
  - `multi-select-body.test.tsx`
  - `quick-check-card.test.tsx`
  - `assignment-item-card.test.tsx`
  - `two-tier-body.test.tsx`
- [ ] Visual regression: rendered output matches the pre-refactor visual
- [ ] Build / typecheck / lint pass

## References
- Parent feature: `.work/active/features/feature-refactor-shared-choice-indicators.md` § Step 2
- Files: `packages/ui/src/components/item-bodies/{single-choice-body,multi-select-body,item-body-shared.module}.{tsx,css}`
- Depends on step-1 primitive
