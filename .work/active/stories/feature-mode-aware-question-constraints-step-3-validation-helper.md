---
id: feature-mode-aware-question-constraints-step-3-validation-helper
kind: story
stage: implementing
tags: [content, tool-schema]
parent: feature-mode-aware-question-constraints
depends_on: [feature-mode-aware-question-constraints-step-1-types-and-defaults]
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 3: Shared `validateQuestionConstraints` helper

## Scope
A single shared helper used by every question-emitting tool. Takes the question payload + the resolved constraints + the mode label, returns either `{ ok: true }` or a `ValidationFailure` with an agent-friendly descriptive error message.

## Implementation
- Create `packages/tools/src/dialog/validate-question-constraints.ts`:
  - Export `QuestionPayloadForValidation` interface (prompt: string, options: array of string | `{label: string}`, multiSelect?)
  - Export `ValidationResult = { ok: true } | { ok: false, code: "QUESTION_CONSTRAINT_VIOLATION", field, message }`
  - Export `validateQuestionConstraints(payload, constraints, modeLabel): ValidationResult`
  - Checks in order: prompt word count > promptMaxWords → fail; options.length > choiceCount → fail; per-option label word count > choiceMaxWords → fail
  - `multiSelectCap` is NOT enforced here (it's the answer cap, not the question shape) — documented in source comments
  - Word count helper: trim → split on `/\s+/` → filter Boolean → length
- Add `packages/tools/src/dialog/__tests__/validate-question-constraints.test.ts`:
  - Table-driven: each cap, each branch, success + per-failure-mode
  - Word count edge cases: empty string, single word, leading/trailing whitespace, markdown like `**bold**` counts as one word
  - String vs `{label}` option shapes both accepted

## Acceptance Criteria
- [ ] Helper accepts both string and `{label}` option shapes
- [ ] Returns success when within all caps
- [ ] Returns failure for over-cap prompt, over-cap choice text, over-cap choice count
- [ ] Failure messages are agent-friendly second-person instructive prose
- [ ] `multiSelectCap` NOT enforced here (documented)
- [ ] Unit tests cover every branch + edge cases
- [ ] `pnpm test packages/tools/src/dialog/__tests__/validate-question-constraints.test.ts` passes

## References
- Parent feature: `.work/active/features/feature-mode-aware-question-constraints.md` § Unit 3
- Depends on step-1 types
