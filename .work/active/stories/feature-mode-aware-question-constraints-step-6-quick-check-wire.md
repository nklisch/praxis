---
id: feature-mode-aware-question-constraints-step-6-quick-check-wire
kind: story
stage: done
tags: [content, tool-schema]
parent: feature-mode-aware-question-constraints
depends_on: [feature-mode-aware-question-constraints-step-2-toolcontext-threading, feature-mode-aware-question-constraints-step-3-validation-helper]
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 6: Wire validation into all `quick_check.*` handlers

## Scope
Apply the same constraint-validation pattern to every `quick_check` variant: single-choice, multi-select, short-answer, matching, confidence.

## Implementation
- For each file in `packages/tools/src/quick-check/`:
  - `single-choice.ts` — validate prompt + options
  - `multi-select.ts` — validate prompt + options + multiSelect=true context
  - `short-answer.ts` — validate prompt only (no options; choiceCount/choiceMaxWords don't apply)
  - `matching.ts` — validate prompt + each match-pair label
  - `confidence.ts` — validate prompt only (choices are domain-fixed: "high/medium/low")
- Each handler:
  - Reads `ctx.questionConstraints ?? FALLBACK_QUESTION_CONSTRAINTS`
  - Calls `validateQuestionConstraints` with the appropriate payload shape
  - Returns short-circuit failure tool-result on violation
- Extend tests in `packages/tools/src/quick-check/__tests__/`:
  - One per-variant over-cap-prompt test
  - For variants with choices/options: one over-cap-choice test
  - Within-cap success preserved (existing tests)

## Acceptance Criteria
- [x] All 5 quick_check variants validate against `ctx.questionConstraints`
- [x] Each variant returns descriptive failure tool-result on over-cap
- [x] Tests cover each variant's failure path
- [x] Within-cap behavior unchanged across all variants
- [x] Existing quick-check tests pass

## Implementation notes (2026-05-24)

All 5 quick_check variants wired. Pattern mirrors step-5 (`ask-student-question`): read `ctx.questionConstraints ?? INLINE_FALLBACK_CONSTRAINTS`, call `validateQuestionConstraints`, throw on failure (caught by registry → `ok:false` tool result).

**Fallback constant**: Each variant file defines its own `INLINE_FALLBACK_CONSTRAINTS` inline (same as step-5's approach in `ask-student-question.ts`). This avoids creating a shared module that might become a maintenance hazard.

**Matching variant**: Two-pass validation — (1) validate prompt + left-column item texts, (2) validate right-column item texts with a sentinel `" "` prompt (0 words, always passes the prompt check). The `choiceCount` cap applies to each column independently (e.g., ≤5 left items, ≤5 right items in teach mode). This is the cleanest decomposition without extending the helper's API.

**short-answer and confidence**: Validated with `options: []` — no option-count or option-word checks fire; only the prompt word-count check applies. This is correct since short-answer has no model-authored options, and confidence choices are domain-fixed rating labels.

**Tests**: 15 new tests added to `quick-check-tools.test.ts` — one over-cap-prompt and one over-cap-choice (where applicable) per variant, plus one within-cap success assertion per variant. All 38 tests pass (23 pre-existing + 15 new).

## References
- Parent feature: `.work/active/features/feature-mode-aware-question-constraints.md` § Unit 6
- Depends on step-2 (ToolContext field) and step-3 (validation helper)

## Review (2026-05-24)

**Verdict**: Approve

**Blockers**: none / **Important**: none / **Nits**: none

**Notes**: All 5 quick_check variants wired with the same pattern step-5 established (inline FALLBACK, throw on failure, `ctx.modeId` modeLabel). 262 LoC tests across 15 new cases covering per-variant over-cap prompt + over-cap choice (where applicable) + within-cap success. Smart matching-variant decomposition: two-pass validation (prompt + left column, then right column with sentinel `" "` prompt) keeps `choiceCount` cap per-column without extending the helper API. Short-answer and confidence correctly skip option validation (empty options array passed). Pattern parity with step-5 = consistent error surface across all 6 question tools.
