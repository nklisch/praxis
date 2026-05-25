---
id: feature-mode-aware-question-constraints-step-5-ask-student-question-wire
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
- [x] Handler validates every question upfront
- [x] Over-cap returns failure tool-result with descriptive message
- [x] Within-cap behavior unchanged
- [x] Short-circuits on first failure (no partial side effects)
- [x] Tests cover prompt over-cap, choice text over-cap, choice count over-cap, mixed
- [x] Existing tests still pass

## Implementation notes (2026-05-24)

### Dependency boundary — inline fallback instead of importing from `@praxis/curriculum`

`FALLBACK_QUESTION_CONSTRAINTS` lives in `@praxis/curriculum`, which `@praxis/tools` cannot import at runtime per the dependency direction rules (`@praxis/tools` is a peer of `@praxis/curriculum`, both depending only on type-only `@praxis/core/types`). Defined `INLINE_FALLBACK_CONSTRAINTS` inline in `ask-student-question.ts` mirroring the curriculum values (`promptMaxWords: 60, choiceMaxWords: 25, choiceCount: 5, multiSelectCap: 6`). A comment marks the values as intentionally duplicated and notes where to update if they drift.

### Error surface — throw, not return

The existing handler error path uses `throw new Error(...)` (see the `unexpected answer kind` throw). The registry catches all handler throws and wraps them as `{ ok: false, error: { code: "tool.handler_threw", message, ... } }`. Using the same mechanism for constraint violations keeps one consistent error-surface contract. No new error type was introduced.

### modeLabel — `ctx.modeId ?? "current"`

`ToolContext` only carries `modeId`, not the display name. Using `ctx.modeId` directly produces clear agent-facing messages: "Question prompt too long for teach mode (...)". A future polish pass could resolve the pretty display name from curriculum, but `modeId` reads naturally in the error message without additional work.

### `makeToolContext` — added `questionConstraints` support

`tests/helpers/tool-context.ts` did not yet expose `questionConstraints` (step-2 threaded it through the session service but hadn't wired it into the test helper). Added `questionConstraints?: Required<QuestionConstraints>` to `MakeToolContextOptions` and the spread in the returned object so test cases can exercise both the constrained and unconstrained paths.

### Loop style — `for...of` avoids `noNonNullAssertion`

`noUncheckedIndexedAccess` requires a non-null assertion on `args.questions[i]`, which Biome's `noNonNullAssertion` rule rejects. Switched to `for...of` which satisfies both rules cleanly.

## References
- Parent feature: `.work/active/features/feature-mode-aware-question-constraints.md` § Unit 5
- Depends on step-2 (ToolContext field) and step-3 (validation helper)

## Review (2026-05-24)

**Verdict**: Approve

**Blockers**: none / **Important**: none / **Nits**: none

**Notes**: 31 LoC handler change + 145 LoC tests + 11 LoC test-helper extension. Inline `INLINE_FALLBACK_CONSTRAINTS` is the correct call given `@praxis/tools` can't import `@praxis/curriculum` at runtime per dep direction rules — duplication acknowledged + commented for future drift detection. Throw-on-failure matches existing handler error contract (the registry catches and wraps as `{ok: false, error}` tool result); no new error mechanism introduced. `for...of` over indexed loop avoids the `noNonNullAssertion` / `noUncheckedIndexedAccess` clash cleanly. `modeLabel = ctx.modeId ?? "current"` reads naturally in agent messages. Test helper extension (`makeToolContext.questionConstraints`) was a necessary supporting change. 5 new constraint-violation tests + within-cap success preserved + mixed-array short-circuit assertion (no partial enqueue).
