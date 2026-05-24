---
id: feature-mode-aware-question-constraints-step-5-ask-student-question-wire
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

# Step 5: Wire validation into `ask_student_question` handler

## Scope
Add per-mode constraint validation to `ask_student_question`. Validates upfront before any side effect; short-circuits on first failure with the helper's descriptive error.

## Implementation
- Edit `packages/tools/src/dialog/ask-student-question.ts`:
  - In the handler, before awaiting `QuickCheckService`, iterate `args.questions` and validate each via `validateQuestionConstraints(question, ctx.questionConstraints ?? FALLBACK_QUESTION_CONSTRAINTS, modeLabel)`
  - On first failure, return `{ ok: false, error: { code: "QUESTION_CONSTRAINT_VIOLATION", message: failure.message } }` as the tool-result envelope
  - Resolve `modeLabel` from ctx (best agent-facing string — `displayName` or `label` or `id`)
- Extend `packages/tools/src/dialog/__tests__/ask-student-question.test.ts`:
  - Over-cap prompt fails with descriptive message
  - Over-cap choice text fails with descriptive message + correct index
  - Over-cap choice count fails
  - Within-cap call succeeds (existing test behavior preserved)
  - Mixed valid-then-invalid questions array: fails on first invalid, no partial enqueue

## Acceptance Criteria
- [ ] Handler validates every question upfront
- [ ] Over-cap returns failure tool-result with descriptive message
- [ ] Within-cap behavior unchanged
- [ ] Short-circuits on first failure (no partial side effects)
- [ ] Tests cover prompt over-cap, choice text over-cap, choice count over-cap, mixed
- [ ] Existing tests still pass

## References
- Parent feature: `.work/active/features/feature-mode-aware-question-constraints.md` § Unit 5
- Depends on step-2 (ToolContext field) and step-3 (validation helper)
