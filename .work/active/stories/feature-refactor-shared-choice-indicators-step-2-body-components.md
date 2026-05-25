---
id: feature-refactor-shared-choice-indicators-step-2-body-components
kind: story
stage: done
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

## Implementation notes (2026-05-24)

**Files touched:**
- `packages/ui/src/components/item-bodies/single-choice-body.tsx` — added `indicatorStyles` import from `choice-indicator.module.css`; replaced `feedbackClass` on `<label>` + `feedbackGlyph` `<span>` pair with a single `<span aria-hidden="true">` composed from `choiceIndicator + choiceIndicatorRadio [+ choiceIndicatorCorrect|choiceIndicatorIncorrect]`, driven by `data-selected` attribute.
- `packages/ui/src/components/item-bodies/multi-select-body.tsx` — same refactor; `choiceIndicatorCheck` instead of `choiceIndicatorRadio`.
- `packages/ui/src/components/item-bodies/item-body-shared.module.css` — removed `.feedbackGlyph` (now unused). Kept `.correct` and `.incorrect` because `ordering-body.tsx` and `matching-body.tsx` still reference them — the story scope's "verified-no-other-consumers" claim was incorrect; grep revealed two additional consumers.

**Deviation from scope:** `.correct` / `.incorrect` were NOT removed from `item-body-shared.module.css` because `ordering-body.tsx` and `matching-body.tsx` still import and apply those classes directly via `styles.correct` / `styles.incorrect`. Removing them would have broken those components silently. Those body types will be addressed in a future refactor step if needed.

**Test results:** 168 test files, 1803 passed, 1 skipped — all green. No test modifications were required; all existing tests use semantic `getByRole` queries.

**Typecheck/lint:** Clean on all changed files. Pre-existing lint errors in unrelated files (mockups HTML) were not introduced by this change.

## Review (2026-05-24)

**Verdict**: Approve

**Blockers**: none / **Important**: none / **Nits**: none

**Notes**: Both body components refactored cleanly — `<span aria-hidden="true">` indicator alongside the native `<input>` with composed `choiceIndicator + Radio|Check + Correct|Incorrect` classes, driven by `data-selected` per the step-1 contract. `.feedbackGlyph` removed (was unused after the refactor). **Important deviation, handled correctly**: agent's pre-edit grep caught that `.correct` / `.incorrect` are ALSO consumed by `ordering-body.tsx` and `matching-body.tsx` — the original audit missed these. Agent kept those classes rather than break the other body types. Honest deviation, documented, followed by a real bug check ("removing would have silently broken those components"). Exactly the right move — flagged in the feature summary as a follow-on (ordering/matching body refactor when ready). 1803 tests pass unmodified (semantic queries throughout, as the audit predicted).
