---
id: feature-refactor-shared-choice-indicators
kind: feature
stage: done
tags: [refactor, ui, design-system]
parent: epic-educational-content-rendering
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Refactor: extract shared choice-indicator primitive across in-chat and tab-body surfaces

## Brief

`[refactor]`-tagged. Visual-language alignment: extract the choice-indicator pattern that currently lives as `.inline-question__indicator--radio` and `.inline-question__indicator--check` (chat-inline questions) to a more universal primitive that `.assignment-item-card` (tab-body quiz / homework / exam items in `packages/ui/src/components/{quiz,homework,exam}-tab-body.tsx`) ALSO composes against. Plus add `--multi-select` mode support to `.assignment-item-card` so multi-select assignment items get the same checkbox indicator + `select all that apply` kicker badge as their chat-inline counterparts.

Likely shape: rename / extract to `.choice-indicator--radio` / `.choice-indicator--check` (or a similarly universal name — `feature-design` picks the final name); update `.inline-question__choice` and `.assignment-item-card__options` to compose against the shared primitive; rewrite production assignment-item-card React components to use the new mode + the shared indicator. Match selected-state visuals across surfaces (accent-muted background, accent indicator border, accent fill — already true of `.inline-question__choice--selected`; assignment items should match). Resolved-state typography stays per-surface (`.thread-chip` for chat-inline; `.assignment-item-card__answered-mark` for graded — different correctness semantics, same visual language family).

The mockup-side primitive extraction is purely additive to `components.css`; the production-code rewrite of the tab-body assignment items is the larger surface. Behavior preserved — same answers, same grading, same correctness feedback. Only the visual primitive that backs the choice indicators changes.

## Epic context

- Parent epic: `epic-educational-content-rendering`
- Position in epic: **independent refactor** — does not depend on the renderer pipeline or the math-rendering or the question-tool-constraints features. The shared indicator primitive already exists in `components.css` as `.inline-question__indicator--radio` / `--check`; this feature renames + extends + rewrites production consumers. Can land in any order relative to the other three features in this epic.

## Cross-epic dependency

Soft adjacency with `feature-question-panel-rework` (sibling epic `epic-chat-interaction-ux-overhaul`). Both touch the `.inline-question` component family. If `feature-question-panel-rework` lands first, this feature updates its design-pass-resulting code to the renamed primitive. If this feature lands first, `feature-question-panel-rework` adopts the renamed primitive from the start. Coordination at design-pass time, not a hard `depends_on`.

## Mockups

- Inherits design system: `.mockups/design-system/{tokens,motion,components}.css`
- Current indicator primitive (chat-inline): `.mockups/design-system/components.html` § Chat surface — the `.inline-question` demos show `.inline-question__indicator--radio` / `--check` in action.
- Existing assignment-item-card primitive (tab-body): `.mockups/design-system/components.html` (existing Tier-2 widget, currently no shared indicator).
- Question chassis context (chat-inline side that the refactor aligns to): `.mockups/screens/feature-question-panel-rework/state-single.html` (radio), `state-multi-select.html` (check), `state-paged.html` (mixed).

## Foundation references

- `docs/ARCHITECTURE.md` § `@praxis/ui` — package owns both the assignment-item-card production component and the chat-inline question chassis.
- `.claude/rules/patterns.md` — no existing pattern covers this specifically; this refactor is the input to whether a new pattern "shared-form-primitive-across-surfaces" emerges.

## Design decisions

*(captured 2026-05-24 via `feature-design --only-questions`. These lock in directional choices so the full design pass inherits them.)*

- **Primitive name**: `.choice-indicator` + `--radio` / `--check` modifiers. Reads as "the indicator next to a choice"; modifiers describe the visual shape. Fits the editorial-system naming pattern (noun-based, not interaction-based). Used by both `.inline-question__choice` (chat-inline) and `.assignment-item-card__option` (tab-body), both of which contain "choice" semantically. Existing `.inline-question__indicator--radio` / `--check` get renamed to `.choice-indicator--radio` / `--check`; nested-name selectors update accordingly.

- **Correctness state support**: yes — add `--correct` and `--incorrect` modifiers to the shared primitive. Graded contexts (homework, quiz, exam) mark answered choices with correctness after submit; the modifiers carry that visual treatment (e.g., `.choice-indicator--correct` shows a check-mark in success color; `.choice-indicator--incorrect` shows an X in danger color, both regardless of whether the indicator base is `--radio` or `--check`). Chat-inline questions don't use these modifiers today (they're disambiguation, not assessment), but the modifiers are available if a future grading-in-chat surface appears. Keep the existing `.assignment-item-card__answered-mark` separate — it's a CHOICE-LEVEL annotation; the correctness modifier on the indicator is a fine-grained sibling that can compose with or replace the answered-mark over time.

- **Multi-select scope on assignment-item-card**: visual + tool-result shape together. Adds the checkbox indicator AND updates the assignment-item-card React component (`packages/ui/src/components/{quiz,homework,exam}-tab-body.tsx`) to accept an array of selected indices (vs single index). The relevant tool result shape emits `{selectedIndices: number[]}` for multi-select items. Grading code in `@praxis/tools` updates to handle arrays. End-to-end multi-select support for tab-body assignment items — matches what the chat-inline multi-select chassis already does. Item-schema migration: existing items use `correctIndex: number` → add optional `correctIndices: number[]` for multi-select items; single-select items keep using `correctIndex`.

- **Migration shape**: single coordinated PR touching all three tab bodies (quiz, homework, exam) + the CSS extraction + the tool result shape + tests. Rationale: no users in production yet, so no rollout risk; atomic visual consistency lets reviewer confirm the three tab bodies render identically after the change; tests for all three updated together prevents drift. Bigger diff than splitting; safer than splitting in this codebase state. Single squash-merge commit lands the whole refactor.

## Cross-feature coordination

- The renamed `.choice-indicator--radio` / `--check` primitive lives in `components.css`. `feature-question-panel-rework` (sibling epic, will design after this) consumes the renamed primitive from the start IF it designs after this feature ships; OR adopts the renamed primitive in a follow-up edit if it designs in parallel. Either order is fine — coordinate via the feature bodies (this feature locks the name; `feature-question-panel-rework` references it from its design pass).
- The `correctIndices: number[]` tool result shape change ripples to grading code. Verify grading tests cover both `correctIndex` (single) and `correctIndices` (multi) paths in the same coordinated PR.

## Audit revision (2026-05-24, post-refactor-design)

**The audit revealed the refactor is smaller than the original brief implied.** Two of the design decisions don't apply:

- **Multi-select is ALREADY implemented in production** as `kind: "multi-select"` items via `packages/ui/src/components/item-bodies/multi-select-body.tsx` with `correctOptionIndices: number[]` already in `packages/tools/src/assignment/item-schema.ts` lines 65-73. `AssignmentItemCard` already dispatches to `<MultiSelectBody>` when `item.kind === "multi-select"`. The "add multi-select to assignment-item-card" decision is satisfied — no new schema, no new grader, no new tool result shape. The `correctOptionIndex` / `correctOptionIndices` field names are also more verbose than the design body assumed; honor existing naming.

- **There is no `.inline-question__indicator` class in production CSS.** That name appears only in the mockup at `.mockups/design-system/components.css`. Production uses scattered classes in `packages/ui/src/components/item-bodies/item-body-shared.module.css` (lines 35–51): `.optionInput` (the radio/checkbox itself), `.correct` / `.incorrect` (state classes on `.optionLabel`), `.feedbackGlyph` (the · / ° marker). The refactor is more about *consolidating these scattered fragments into a named primitive* than about *renaming an existing primitive*.

The remaining work, post-audit:
- Extract `.choice-indicator` + variants from the scattered classes into a single CSS module
- Add the same primitive to `.mockups/design-system/components.css` (for mock/prod parity)
- Update `single-choice-body.tsx` and `multi-select-body.tsx` to compose against the primitive
- Dedupe `assignment-item-card.module.css` which currently duplicates the styling

Tests are semantic-query based (`getByRole("radio")`, `getByRole("checkbox")`) per the audit — zero test-selector updates needed.

## Refactor Overview

Three focused steps, all behavior-preserving:

1. **Define the `.choice-indicator` primitive** — production CSS module + mockup parity
2. **Refactor body components** — single-choice-body + multi-select-body compose against primitive
3. **Dedupe assignment-item-card.module.css** — remove duplicated `.optionInput` / `.optionLabel` rules; compose against primitive

Steps 2 and 3 are independent and can run in parallel once step 1 lands.

## Refactor Steps

### Step 1: Define `.choice-indicator` primitive
**Priority**: High
**Risk**: Low (additive — new CSS, no existing CSS deleted yet)
**Files**:
- `packages/ui/src/components/item-bodies/choice-indicator.module.css` (NEW)
- `.mockups/design-system/components.css` (extend — add the same primitive for mock parity)
**Story**: `feature-refactor-shared-choice-indicators-step-1-primitive`

**Current State**: scattered classes in `item-body-shared.module.css` (lines 35-51):
```css
.optionInput { accent-color: ...; }      /* the input itself */
.correct { /* success border / bg / text on .optionLabel */ }
.incorrect { /* danger border / bg / text on .optionLabel */ }
.feedbackGlyph { /* · or ° marker */ }
```

**Target State**: NEW `choice-indicator.module.css` exporting a named primitive:
```css
.choiceIndicator { /* base: aligned wrapper for input + state */ }
.choiceIndicatorRadio { /* radio-specific style — circular shape, ::after for filled center */ }
.choiceIndicatorCheck { /* check-specific style — square shape, ::after for ✓ */ }
.choiceIndicatorCorrect { /* success color tokens */ }
.choiceIndicatorIncorrect { /* danger color tokens */ }
```

Plus matching `.choice-indicator` (+ `--radio`/`--check`/`--correct`/`--incorrect`) class definitions in `.mockups/design-system/components.css` so mocks stay in lockstep.

**Implementation notes**:
- Variants compose: `<span class="choiceIndicator choiceIndicatorRadio choiceIndicatorCorrect">` produces a correct-state radio.
- All tokens (`var(--color-success)`, `var(--color-danger)`, `var(--radius-pill)`, etc.) — never hardcoded values.
- Keep the existing `.optionInput`, `.correct`, `.incorrect`, `.feedbackGlyph` classes in place during this step — they're consumed by existing code and will be removed in step 2.
- Variants for `--radio` / `--check` use `::after` for the inner fill (CSS-only, no SVG icons).
- Mockup parity: the same class names in production CSS modules and in `.mockups/design-system/components.css` (CSS Modules will hash production names; mock copy uses literal class names).

**Acceptance criteria**:
- [ ] New `choice-indicator.module.css` shipped with the 5 listed classes
- [ ] All values reference design tokens (no hardcoded colors / dimensions)
- [ ] Existing `.optionInput` / `.correct` / `.incorrect` / `.feedbackGlyph` classes untouched
- [ ] Mockup `components.css` has matching `.choice-indicator` family with literal class names
- [ ] Visual smoke: a temporary test page rendering one of each variant matches mockup reference

**Rollback**: pure-additive — revert the new files; no existing surfaces affected.

---

### Step 2: Refactor body components to use the primitive
**Priority**: High
**Risk**: Medium (touches the actual rendering of assignment / quick-check choices)
**Files**:
- `packages/ui/src/components/item-bodies/single-choice-body.tsx`
- `packages/ui/src/components/item-bodies/multi-select-body.tsx`
**Story**: `feature-refactor-shared-choice-indicators-step-2-body-components`

**Current State** (single-choice-body.tsx, lines ~40-59):
```tsx
<input type="radio" className={styles.optionInput} ... />
<label className={`${styles.optionLabel} ${feedbackClass}`}>
  {option}
  {showFeedback && <span className={styles.feedbackGlyph}>{glyph}</span>}
</label>
```

(`multi-select-body.tsx` mirrors this with `<input type="checkbox">`.)

**Target State**:
```tsx
<span className={`${styles.choiceIndicator} ${styles.choiceIndicatorRadio} ${feedbackClass}`} />
<input type="radio" className={styles.optionInput} ... />
<label className={styles.optionLabel}>
  {option}
</label>
```

Where `feedbackClass` is `styles.choiceIndicatorCorrect` or `styles.choiceIndicatorIncorrect` from the new module. The `.feedbackGlyph` can be folded into the indicator's `::after` for correct/incorrect states (CSS-only — see step-1's variants).

**Implementation notes**:
- Move feedback styling from label to indicator. The label keeps its base styling but loses the state-modifier classes.
- `import indicatorStyles from "./choice-indicator.module.css"` alongside existing `import styles from "./item-body-shared.module.css"`.
- Multi-select uses `choiceIndicatorCheck` instead of `choiceIndicatorRadio`; otherwise identical.
- After this step, `item-body-shared.module.css` still has `.correct` / `.incorrect` / `.feedbackGlyph` but they're unused; remove in this same commit.
- Verify existing tests pass without modification (they query by role, per audit).

**Acceptance criteria**:
- [ ] `single-choice-body.tsx` and `multi-select-body.tsx` render via `.choice-indicator*` classes
- [ ] `.correct` / `.incorrect` / `.feedbackGlyph` removed from `item-body-shared.module.css` (no longer referenced)
- [ ] All existing tests (`single-choice-body.test.tsx`, `multi-select-body.test.tsx`, `quick-check-card.test.tsx`, `assignment-item-card.test.tsx`) pass unchanged
- [ ] Visual regression: render same item before and after refactor; visually identical (check via screenshot diff or manual)
- [ ] Build / typecheck / lint pass

**Rollback**: revert both files + restore the removed CSS classes from item-body-shared.module.css (preserved in git history).

---

### Step 3: Dedupe `assignment-item-card.module.css`
**Priority**: Medium
**Risk**: Low (pure deduplication; styling source moves but visual output preserved)
**Files**:
- `packages/ui/src/components/assignment-item-card.module.css`
- `packages/ui/src/components/assignment-item-card.tsx` (small — re-import path for shared input/label styling)
**Story**: `feature-refactor-shared-choice-indicators-step-3-assignment-card-dedupe`

**Current State**: `assignment-item-card.module.css` duplicates `.optionInput` / `.optionLabel` rules that also exist in `item-body-shared.module.css`. AssignmentItemCard renders bodies (which use item-body-shared) but ALSO carries its own copy of the input/label styles for the card-level layout.

**Target State**: Single source for input/label styling — either import from `item-body-shared` or extract a third shared module if both surfaces need slightly different variants. AssignmentItemCard composes against the shared module + adds only card-specific layout (not duplicated styling).

**Implementation notes**:
- Inspect both files' `.optionInput` / `.optionLabel` rules side-by-side. If identical → remove from assignment-item-card.module.css; import from item-body-shared.
- If slight differences → extract differences as variant classes (`.optionLabelCard`, etc.) and keep the base shared.
- After this step, all radio/check rendering across the app (chat-inline quick-checks AND tab-body assignment items) uses the same `.choice-indicator` primitive AND the same `.optionInput` / `.optionLabel` baselines.
- No production behavior change — the rendered DOM and visual output stay the same.

**Acceptance criteria**:
- [ ] No duplicated `.optionInput` / `.optionLabel` rules between `assignment-item-card.module.css` and `item-body-shared.module.css`
- [ ] Both surfaces compose against the shared CSS module
- [ ] Visual regression: render assignment-item-card before and after; visually identical
- [ ] All existing tests pass

**Rollback**: restore the duplicated rules from git history.

---

## Implementation Order

1. **step-1-primitive** (deps: `[]`) — define primitive in both production + mockup CSS
2. **step-2-body-components** (deps: `[step-1]`) — refactor body components to use primitive
3. **step-3-assignment-card-dedupe** (deps: `[step-1]`) — dedupe assignment-item-card.module.css

Steps 2 and 3 can run in parallel once step 1 lands. Single coordinated commit per the design decision is at the PR level; each step still commits independently for rollback safety.

## Atomic-step acknowledgment

None of the three steps are inherently atomic — each can be reverted in isolation. The original design decision specified "single coordinated PR", which still holds at the PR-merge level; the steps just decompose work for parallelism + rollback granularity within that PR.

## Risks

- **Visual regression risk**. Even with token-only styling, moving classes from label to indicator could shift pixel alignment by 1-2px. Mitigation: side-by-side visual comparison before merging.

- **CSS Modules class-name interop with mockup**. Mock uses literal `.choice-indicator--radio`; production CSS Modules hashes. The mockup is reference-only — no shared CSS file. Mitigation: document the mapping explicitly in the new module's header comment.

- **`item-body-shared.module.css` still has consumers other than the body components**. Verify by grep before deleting `.correct` / `.incorrect`. If any other component reads them, either update those consumers OR keep the classes as backward-compat aliases. Audit found no other consumers, but double-check at implementation time.

- **Sibling coordination with `feature-question-panel-rework`**. That feature is at drafting in `epic-chat-interaction-ux-overhaul`. When it designs its question chassis, it should compose against the new `.choice-indicator` primitive. The question-panel-rework design pass needs to reference this feature's class names. Document in a comment on the new CSS module that the question-panel-rework feature will adopt these classes when it designs.

## Implementation summary (2026-05-24)

All 3 child stories landed under implement-orchestrator:

- `step-1-primitive` (commit `a844fa1`) — new `choice-indicator.module.css` with 5 classes; state-driven by `data-selected="true"` attribute (not `:checked` peer-selector) so the indicator is self-contained. Local CSS custom-property pivots (`--_indicator-fill`, `--_indicator-border-color`) keep feedback-variant overrides DRY. Added matching `.choice-indicator` family to `.mockups/design-system/components.css`. 14 tests covering 6 state combinations + module resolution + variant exclusivity.

- `step-2-body-components` (commit `2dd55bd`) — `single-choice-body.tsx` and `multi-select-body.tsx` refactored to render via the new primitive (`choiceIndicator + choiceIndicatorRadio|Check + [choiceIndicatorCorrect|choiceIndicatorIncorrect]`). `.feedbackGlyph` removed. **Important deviation**: the audit's "no other consumers" claim was incorrect — `.correct`/`.incorrect` are still imported by `ordering-body.tsx` and `matching-body.tsx`. Agent correctly preserved those classes rather than breaking the other components. Those body types will be addressed in a follow-on refactor when their families are unified.

- `step-3-assignment-card-dedupe` (commit `84d3a76`) — pure dead-code removal. `assignment-item-card.tsx` never directly referenced its module's `.optionLabel` / `.optionInput` / `.options` — the card dispatches choice rendering through the body components. Removed 35 lines of unreferenced CSS. No tsx changes.

Verification at advance time: full workspace typecheck green; `pnpm --filter @praxis/ui test` — 1803 passed, 1 skipped (the math-step-3 placeholder).

What's now possible: the shared `.choice-indicator` primitive ships in production. Single-choice and multi-select body components compose against it consistently. Sibling feature `feature-question-panel-rework` can now adopt the same primitive when designing its question chassis, sharing the visual language across chat-inline questions and tab-body assignment items.

Follow-on noted: extracting `.correct` / `.incorrect` out of `item-body-shared.module.css` is incomplete until `ordering-body.tsx` and `matching-body.tsx` also adopt the new primitive. Not blocking — flag as a future refactor candidate.

## Review (2026-05-24)

**Verdict**: Approve

**Blockers**: none / **Important**: none / **Nits**: none

**Notes**: All 3 child stories individually reviewed + approved. Feature-level capability check: shared `.choice-indicator` primitive shipped with design-token-only CSS; `single-choice-body` + `multi-select-body` compose against it via `data-selected` attribute contract; dead-code removed from `assignment-item-card.module.css`. Important honest deviation from step-2 (audit missed `.correct`/`.incorrect` consumers in `ordering-body.tsx` and `matching-body.tsx`) handled correctly — classes preserved, follow-on flagged. No regressions; 1803 tests pass. Parent epic `epic-educational-content-rendering` still active (3 sibling features still implementing) — feature stays in `.work/active/` per substrate stage-discipline (active parent means children don't archive yet).

What's now possible: the shared `.choice-indicator` primitive is available for `feature-question-panel-rework` to adopt when its question chassis lands. Single-choice and multi-select assignment items share the same visual primitive across all surfaces. Follow-on flagged: extracting `.correct`/`.incorrect` out of `item-body-shared.module.css` becomes a candidate refactor once `ordering-body.tsx` and `matching-body.tsx` also adopt the primitive.
