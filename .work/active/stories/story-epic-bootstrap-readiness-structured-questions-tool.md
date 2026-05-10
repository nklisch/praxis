---
id: story-epic-bootstrap-readiness-structured-questions-tool
kind: story
stage: implementing
tags: [tools, bootstrap, tutor-ux]
parent: epic-bootstrap-readiness-structured-questions
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# `ask_student_question` tool + type union extensions

## Scope

The backend half of the structured-questions feature. Adds the new
`StructuredQuestionItem` variant to `AssignmentItem`, the matching
`structured-question` variant to `QuickCheckAnswer`, the
`ask_student_question` tool, and the mode-registry + prompt-fragment
wiring that exposes it to bootstrap and configure modes.

## Units implemented

- **Unit 1** — `StructuredQuestionItem` added to `AssignmentItem`;
  `structured-question` added to `QuickCheckAnswer`.
- **Unit 2** — `ask_student_question` tool at
  `packages/tools/src/dialog/ask-student-question.ts`.
- **Unit 3** — Registry export, `bootstrapMode.toolNames` +
  `configureMode.toolNames` additions, `bootstrapToolsFragment` prose.
- **Unit 6 partial** — backend tests (schema validation, handler
  unit, end-to-end through QuickCheckService).

## Files touched

- `packages/core/src/types/artifacts.ts` — extend `AssignmentItem` union.
- `packages/core/src/types/quick-check.ts` — extend `QuickCheckAnswer`
  union.
- `packages/tools/src/dialog/ask-student-question.ts` (new) — tool.
- `packages/tools/src/dialog/index.ts` (new) — barrel export.
- `packages/tools/src/index.ts` — add to default registry array.
- `packages/curriculum/src/modes/bootstrap.ts` — add tool name.
- `packages/curriculum/src/modes/configure.ts` — add tool name.
- `packages/curriculum/src/modes/fragments/bootstrap-tools.ts` —
  document the tool in the prompt.
- `packages/tools/src/dialog/__tests__/ask-student-question.test.ts`
  (new) — handler + schema tests.
- `packages/core/src/__tests__/quick-check-service-structured.test.ts`
  (new) — end-to-end round-trip through the existing service.
- Any other file with a `switch` on `AssignmentItem.kind` or
  `QuickCheckAnswer.kind` that hits an exhaustiveness error — add the
  new case (most are no-op default branches).

## Acceptance

- [ ] `StructuredQuestionItem` exported from `@praxis/core/types` with
      the design's shape (`kind`, `id`, `questions: Array<{header,
      prompt, multiSelect, options: Array<{label, description?}>}>`).
- [ ] `AssignmentItem` union includes `StructuredQuestionItem`.
- [ ] `QuickCheckAnswer` union includes `{ kind: "structured-question";
      answers: Array<{questionIndex, selectedIndices}> }`.
- [ ] `ask_student_question` tool defined per the design: Zod schema
      with `min(1).max(4)` questions, `min(2).max(8)` options per
      question, `multiSelect` defaulting to false.
- [ ] Tool handler routes through `ctx.services.quickCheck.await`;
      returns `{ answers, abandoned? }` on success or abandonment.
- [ ] Tool reachable via `registry.dispatch("ask_student_question",
      args)`.
- [ ] `bootstrapMode.toolNames` and `configureMode.toolNames` include
      `"ask_student_question"`.
- [ ] `bootstrapToolsFragment` prose names the tool with a one-line
      "use this when you need a decision" rationale.
- [ ] Schema validation tests: rejects empty `questions`, 5+
      questions, 0-1 options, 9+ options.
- [ ] Handler unit tests: happy path returns the answer; abandoned
      path returns `{ answers: [], abandoned: true }`; wrong-kind
      answer throws.
- [ ] End-to-end test through `QuickCheckServiceImpl`: handler call →
      service `pending` event → `resolve(callId, structuredAnswer)` →
      handler Promise resolves with the answer.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Out of scope (sibling story handles)

- `<StructuredQuestionCard />` UI component.
- Chat-tab-body integration (`quickChecks.map` switch).
- UI tests.

## Parent context

- Parent feature: `epic-bootstrap-readiness-structured-questions`
- Parent epic: `epic-bootstrap-readiness`
- Sibling story `story-epic-bootstrap-readiness-structured-questions-ui`
  depends on this one (needs the types).
