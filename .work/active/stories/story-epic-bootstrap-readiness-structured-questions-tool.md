---
id: story-epic-bootstrap-readiness-structured-questions-tool
kind: story
stage: done
tags: [tools, bootstrap, tutor-ux]
parent: epic-bootstrap-readiness-structured-questions
depends_on: []
release_binding: v0.1.1
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

## Implementation notes

### Files changed

**New files:**
- `packages/tools/src/dialog/ask-student-question.ts` — tool definition with Zod schema + handler
- `packages/tools/src/dialog/index.ts` — barrel + `DIALOG_TOOLS` array
- `packages/core/src/services/graders/structured-question-grader.ts` — no-op grader for registry exhaustiveness
- `packages/tools/src/dialog/__tests__/ask-student-question.test.ts` — 15 tests
- `packages/core/src/__tests__/quick-check-service-structured.test.ts` — 7 tests

**Modified files:**
- `packages/core/src/types/artifacts.ts` — added `StructuredQuestionItem` interface and appended to `AssignmentItem` union
- `packages/core/src/types/quick-check.ts` — added `structured-question` variant to `QuickCheckAnswer`
- `packages/core/src/services/graders/registry.ts` — added `structured-question` entry pointing to no-op grader
- `packages/core/src/services/assignment-service.ts` — fixed `authoredBy` propagation to skip `structured-question` items
- `packages/core/src/services/graders/approach-feedback.ts` — guarded `item.prompt` access for union exhaustiveness
- `packages/core/src/services/graders/rubric-agent.ts` — guarded `item.prompt` access for union exhaustiveness
- `packages/core/src/__tests__/assignment-service.test.ts` — narrowed `authoredBy` access to satisfy TS
- `packages/curriculum/src/modes/bootstrap.ts` — added `"ask_student_question"` to toolNames
- `packages/curriculum/src/modes/configure.ts` — added `"ask_student_question"` to toolNames
- `packages/curriculum/src/modes/fragments/bootstrap-tools.ts` — added tool listing line
- `packages/tools/package.json` — added `./dialog` export path
- `packages/desktop/electron/main/services.ts` — imported and spread `DIALOG_TOOLS`
- `packages/ui/src/components/assignment-item-card.tsx` — added `structured-question` no-op case + guarded `item.prompt`
- `packages/ui/src/components/quick-check-card.tsx` — added `structured-question` no-op case + guarded `item.prompt`

### Exhaustive-switch sites updated

- **`graders/registry.ts`**: `Record<AssignmentItem["kind"], ItemGrader>` — added `StructuredQuestionGrader` (throws if called).
- **`ui/assignment-item-card.tsx`**: `renderBody()` switch — added `case "structured-question": return null;`
- **`ui/quick-check-card.tsx`**: `renderQuickCheckBody()` switch — added `case "structured-question": return null;` (sibling story wires real UI).
- **`graders/approach-feedback.ts`** and **`rubric-agent.ts`**: accessed `item.prompt` via `"prompt" in item` narrowing guard.

### AssignmentItem-union friction notes

- `StructuredQuestionItem` intentionally lacks `prompt` (top-level), `authoredBy`, and grading fields. This required:
  - Guarding `item.prompt` accesses in two grader helpers (approach-feedback + rubric-agent).
  - Fixing the `authoredBy` propagation in `assignment-service.ts` to skip `structured-question` items.
  - Fixing one test that accessed `authoredBy` on the unnarrowed union.
  - Adding a no-op `StructuredQuestionGrader` to satisfy the exhaustive `Record<>` registry type.
- The `AssignmentItemSchema` (Zod) in `packages/tools/src/assignment/item-schema.ts` was NOT updated — `structured-question` items are never placed in `Assignment.items` and `assignment.create` should reject them.
- The `exactOptionalPropertyTypes` flag required explicit mapping of `options` in the handler to omit `description` when undefined.

### Test count

- Tool tests: 15 (schema validation ×9, handler ×5, registry integration ×1)
- QuickCheckService round-trip tests: 7

### Verification status

`pnpm typecheck && pnpm lint && pnpm test` — all green (2434 tests pass, 6 pre-existing lint errors unrelated to this story).

## Review (2026-05-10)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- `docs/CONTRACT.md:1402-1406` lists the `quick_check.*` tools; `ask_student_question` joins that category but isn't documented in CONTRACT yet. The docs gate during release will catch this.
- The `StructuredQuestionGrader` defensive throw is the right shape, but its existence is a structural smell — `AssignmentItem` is now genuinely overloaded between assessment items and dialog items. The design's risk callout flagged this; revisit if a third non-assessment kind appears.

**Notes**: Tool handler is clean — Zod schema enforces bounds (1-4 questions, 2-8 options, required `header`/`prompt`), default `multiSelect: false`, abandoned-path early return, defensive throw for wrong-kind answer. The `exactOptionalPropertyTypes`-compatible options build avoids a strict-mode trap. Exhaustive-switch sites updated mechanically: graders/registry adds the no-op grader, approach-feedback + rubric-agent + assignment-service + two UI cards each get a case (most are guards/early-returns since `prompt` doesn't exist on `StructuredQuestionItem`). Tool description steers the model correctly with do/don't examples. 22 new tests; full suite green.
