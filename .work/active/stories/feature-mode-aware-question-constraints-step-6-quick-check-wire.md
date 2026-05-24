---
id: feature-mode-aware-question-constraints-step-6-quick-check-wire
kind: story
stage: implementing
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
- [ ] All 5 quick_check variants validate against `ctx.questionConstraints`
- [ ] Each variant returns descriptive failure tool-result on over-cap
- [ ] Tests cover each variant's failure path
- [ ] Within-cap behavior unchanged across all variants
- [ ] Existing quick-check tests pass

## References
- Parent feature: `.work/active/features/feature-mode-aware-question-constraints.md` § Unit 6
- Depends on step-2 (ToolContext field) and step-3 (validation helper)
