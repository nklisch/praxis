---
id: feature-refactor-shared-choice-indicators-step-3-assignment-card-dedupe
kind: story
stage: review
tags: [refactor, ui]
parent: feature-refactor-shared-choice-indicators
depends_on: [feature-refactor-shared-choice-indicators-step-1-primitive]
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-24
---

# Step 3: Dedupe `assignment-item-card.module.css`

## Scope
Remove the duplicated `.optionInput` / `.optionLabel` rules from `assignment-item-card.module.css` that also exist in `item-body-shared.module.css`. AssignmentItemCard composes against the shared module + adds only card-specific layout.

## Implementation
- Inspect both files' `.optionInput` / `.optionLabel` rules side-by-side
- If identical: remove from `assignment-item-card.module.css`; if AssignmentItemCard's tsx imports them, update import to reference `item-body-shared.module.css`
- If slight differences:
  - Extract differences as variant classes (`.optionLabelCard`, etc.) in `assignment-item-card.module.css`
  - Base styling stays in `item-body-shared.module.css`
- Verify no production behavior change: the rendered DOM and visual output stay the same
- Run all tests; AssignmentItemCard tests use semantic queries — no selector updates expected
- Visual regression: assignment-item-card renders identically before-and-after

## Acceptance Criteria
- [ ] No duplicated `.optionInput` / `.optionLabel` rules between `assignment-item-card.module.css` and `item-body-shared.module.css`
- [ ] AssignmentItemCard tsx imports the right module
- [ ] Visual regression: AssignmentItemCard renders identically
- [ ] `assignment-item-card.test.tsx` passes without modification
- [ ] Build / typecheck / lint pass

## References
- Parent feature: `.work/active/features/feature-refactor-shared-choice-indicators.md` § Step 3
- Files: `packages/ui/src/components/assignment-item-card.module.css`, `assignment-item-card.tsx`
- Depends on step-1 primitive

## Implementation notes (2026-05-24)

**Case applied: A — pure dead-code removal.**

### Discovery

`assignment-item-card.tsx` never directly references `styles.optionLabel` or `styles.optionInput`. The card dispatches choice rendering to `<SingleChoiceBody>` and `<MultiSelectBody>`, which import from `item-body-shared.module.css`. The `.optionLabel`, `.optionLabel:hover:not(.disabled)`, `.optionLabel.disabled`, `.optionInput`, and the `.options` list rule in `assignment-item-card.module.css` were entirely unreferenced dead code — no TSX file in the project used `cardStyles.optionLabel` or `styles.optionLabel` pointing at the card's module.

No `assignment-item-card.tsx` changes required.

### Side-by-side diff (for record)

The shared module's rules differ slightly:
- `.optionLabel` adds `border: 1px solid transparent` (to support the `.correct`/`.incorrect` feedback-state transition)
- `.optionLabel:hover` selector also guards against `.correct`/`.incorrect` in the shared file
- `.optionInput` adds `flex-shrink: 0`

These differences are irrelevant because the card's copy was dead code regardless.

### Files touched
- `packages/ui/src/components/assignment-item-card.module.css` — removed the entire `/* ── Multiple choice ──── */` section (35 lines: `.options`, `.optionLabel`, `.optionLabel:hover`, `.optionLabel.disabled`, `.optionInput`)

### Test results
- `pnpm typecheck` — pass (0 errors)
- `pnpm --filter @praxis/ui test` — 1803 passed, 0 failed
- Pre-existing biome lint errors in `.mockups/` and other unrelated files; none introduced by this change
