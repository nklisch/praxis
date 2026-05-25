---
id: feature-mode-aware-question-constraints-step-3-validation-helper
kind: story
stage: done
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
- [x] Helper accepts both string and `{label}` option shapes
- [x] Returns success when within all caps
- [x] Returns failure for over-cap prompt, over-cap choice text, over-cap choice count
- [x] Failure messages are agent-friendly second-person instructive prose
- [x] `multiSelectCap` NOT enforced here (documented)
- [x] Unit tests cover every branch + edge cases
- [x] `pnpm test packages/tools/src/dialog/__tests__/validate-question-constraints.test.ts` passes

## Implementation notes (2026-05-24)

Implemented exactly per spec:

- `packages/tools/src/dialog/validate-question-constraints.ts` — exports `QuestionPayloadForValidation`, `ValidationResult`, and `validateQuestionConstraints`. Imports `QuestionConstraints` from `@praxis/core/types` (confirmed exported via `export type * from "./mode.js"` in the types index). The `multiSelectCap` non-enforcement is documented in both the module-level JSDoc and inline in the function. The internal `countWords` helper is module-private.
- `packages/tools/src/dialog/__tests__/validate-question-constraints.test.ts` — 30 tests across 7 `describe` groups: success paths (exact-cap boundaries, mixed option shapes, multiSelect ignored), prompt-over-cap (boundary, modeLabel in message, ordering vs choiceCount), choiceCount-over-cap (boundary, ordering vs per-option), per-option-over-cap (string + `{label}` shapes, 1-based index in message, boundary), multiSelectCap not enforced, countWords edge cases (empty string, whitespace-only, leading/trailing whitespace, markdown bold as single token), and option-shape coverage.
- All 30 tests pass; typecheck clean; new files pass biome check individually (pre-existing lint failures in `.mockups/` and other packages are unrelated to this story).

## References
- Parent feature: `.work/active/features/feature-mode-aware-question-constraints.md` § Unit 3
- Depends on step-1 types

## Review (2026-05-24)

**Verdict**: Approve

**Blockers**: none / **Important**: none / **Nits**: none

**Notes**: 102 LoC helper + 405 LoC tests (~4:1 ratio reflecting the table-driven test approach). Validation order matches spec exactly: prompt → choice count → per-choice text. Each failure returns the structured `{ ok: false, code, field, message }` with agent-friendly second-person prose ("Trim to the essential framing", "Compress to the choice's distinguishing feature"). `countWords` is `.trim().split(/\s+/).filter(Boolean).length` — handles empty / whitespace-only / multi-whitespace correctly. `multiSelectCap` non-enforcement documented in module JSDoc + inline. 30 tests across 7 describe groups cover every branch, both option shapes (string + `{label}`), and edge cases (empty string, markdown bold as single token).
