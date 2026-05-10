---
id: epic-bootstrap-readiness-structured-questions
kind: feature
stage: implementing
tags: [bootstrap, tutor-ux, tools]
parent: epic-bootstrap-readiness
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Tutor-initiated structured questions

## Brief

The bootstrap agent regularly wants to ask the student a structured
question — "use the canonical pack, the textbook, or both?", "merge these
two lessons or keep them separate?" — and today can't. The Claude Code
built-in `AskUserQuestion` is now hidden from the model entirely (via
`story-fix-block-claude-code-builtins-from-tutor`, which set `tools:
"none"` on `createConversation`), and there's no first-party Praxis tool
that fills the gap. So the agent falls back to text apologies like
"going with the recommended approach" and the student loses the
decision-point.

This feature adds a first-party Praxis tool — working name
`ask_student_question` — that gives the agent the same affordance via
the existing human-in-the-loop dispatch mechanism documented in
`docs/SPEC.md:109` ("Human-in-the-loop tool dispatch"). The agent emits
`tool_call: ask_student_question({ questions: [{ header, prompt,
multiSelect, options: [{ label, description }] }] })`. The handler routes
through `QuickCheckService` (or a sibling service modelled after it),
which holds the tool-result Promise open, emits a `pending` event the
renderer subscribes to, and resolves with the student's answer when a
`<StructuredQuestionCard>` (or a re-used quick-check card) reports the
choice back. The model receives the answer as a tool result in the same
turn and continues seamlessly.

The schema mirrors Claude Code's built-in `AskUserQuestion` shape so
the model's instinct lines up with the available tool — multiple
questions per call, each with `header`, `multiSelect`, and an option
list with `label` + `description`. Reference shapes:
`/home/nathan/dev/claude-cli-sdk/src/tools/builtin-schemas.ts`
(the upstream sdk's `AskUserQuestionInput`) and Claude Code's
documentation. The tool is added to `bootstrapMode.toolNames` and
`configureMode.toolNames` initially; teach mode can add it later when
the curriculum design calls for tutor-driven branching.

This feature does NOT bring back the Claude Code built-in
`AskUserQuestion` (built-ins remain blocked), does NOT change the engine
adapter (no `tools.custom` injection — the new tool registers through
the existing MCP bridge like every other Praxis tool), and does NOT
expand the chat UI's surface beyond a structured-question card.

## Epic context
- Parent epic: `epic-bootstrap-readiness`
- Position in epic: standalone capability — reuses existing
  human-in-the-loop infrastructure. No cross-feature dependencies.

## Foundation references
- `docs/SPEC.md:109-142` — Human-in-the-loop tool dispatch. This is the
  pattern to reuse. The dispatch mechanics, abandonment semantics, and
  multiple-in-flight-checks behaviour all transfer.
- `docs/CONTRACT.md:1402-1406` — `quick_check.*` tool listing pattern;
  `ask_student_question` joins this category with a different shape
  (multi-question, structured-options).
- `packages/tools/src/quick-check/` — existing quick-check tool family;
  template for the new tool's structure.
- `packages/core/src/services/` — `QuickCheckService` lives here;
  pattern to extend or sibling.
- `packages/ui/src/components/` — existing quick-check card components;
  template for the structured-question card.
- `story-fix-block-claude-code-builtins-from-tutor` (archived) — the fix
  this feature builds on top of; explains why this can't just be
  AskUserQuestion intercept.

## Originating backlog
- `idea-tutor-structured-questions-via-custom-mcp` — consumed by this
  feature; will be removed from `.work/backlog/` as part of epic-design.

## Architectural choice

**Reuse `QuickCheckService` as-is; extend `AssignmentItem` and
`QuickCheckAnswer` discriminated unions with a `structured-question`
variant.** No new service, no new IPC channel, no new card-rendering
pipeline — the existing infrastructure round-trips `(callId, item,
answer)` shapes generically.

The `QuickCheckService` (`packages/core/src/services/quick-check-service.ts`)
holds a `Map<callId, PendingEntry>`, emits `pending` events on
`await(...)`, and resolves the Promise on `resolve(...)`. Today the
item is typed as `AssignmentItem` and the answer as `QuickCheckAnswer`,
but the service code itself never switches on `kind` — it just
forwards values. Adding new variants to those unions slots in without
touching the service.

This aligns with `docs/SPEC.md:111` ("Phase 17 introduces this pattern
for the `quick_check.*` family; the mechanism is general enough to
serve future uses (multi-step approval flows, disambiguation
prompts)"). The structured-question tool is exactly the
disambiguation-prompt case SPEC.md anticipated.

Alternatives considered:

- **New `QuestionService` sibling service.** Domain-separation purity
  (decisions vs assessments) but full duplication of the infrastructure
  for what's structurally identical. Rejected.
- **Refactor to a generic `BlockingDispatchService<TItem, TAnswer>`.**
  Premature with two clients; tightens types in places without
  meaningfully cleaning the code. Rejected.
- **Adopt upstream `@nklisch/claude-cli-sdk`'s
  `Tools.intercept('AskUserQuestion', handler)`.** Would let the model
  call its native `AskUserQuestion` name. But the parent epic's earlier
  fix (`story-fix-block-claude-code-builtins-from-tutor`) intentionally
  blocks built-ins via `tools: "none"`, and the upstream Tools builder
  is a v1.1.4 API not present in our in-tree fork. Rejected for v1.
  We control the prompt — the model will use whatever first-party tool
  name we register, AskUserQuestion-flavoured or not.

The tool is named `ask_student_question` (clear, mirrors the model's
intent without overloading any framework name). It's added to
`bootstrapMode.toolNames` and `configureMode.toolNames`. The teach/quiz
modes don't get it in this feature — those modes have other
clarification primitives (the `clarification` tool); revisit later.

## Implementation Units

### Unit 1: `structured-question` variants on the type unions

**Files**:
- `packages/core/src/types/artifacts.ts` — extend `AssignmentItem`
- `packages/core/src/types/quick-check.ts` — extend `QuickCheckAnswer`

**Story**: `story-epic-bootstrap-readiness-structured-questions-tool`

```typescript
// packages/core/src/types/artifacts.ts — append to AssignmentItem union

/**
 * Inline structured-question prompt rendered as a card in the chat.
 * The tutor uses this when it needs the student to make a decision the
 * model can't make on the student's behalf — pack vs textbook,
 * confidence-on-this-topic, branch-here-or-there. Multiple questions
 * in one call (rendered as a stack); each question has its own option
 * list and single-vs-multi-select flag.
 *
 * Not an assessment item — the model doesn't grade the answer; it
 * just acts on it. Reuses AssignmentItem's union to inherit the
 * existing quick-check dispatch pipeline.
 */
export interface StructuredQuestionItem {
  kind: "structured-question";
  /** Tool call id (uuidv7); also used as the React key. */
  id: string;
  questions: Array<{
    /** Very short label shown as a chip / tag (max ~12 chars). */
    header: string;
    /** Full question text shown above the options. */
    prompt: string;
    /** When true, the student can pick more than one option. */
    multiSelect: boolean;
    options: Array<{
      label: string;
      description?: string;
    }>;
  }>;
}

// AssignmentItem union — add to existing variants:
export type AssignmentItem =
  | SingleChoiceItem
  | MultiSelectItem
  | /* ... existing variants ... */
  | StructuredQuestionItem; // ← new
```

```typescript
// packages/core/src/types/quick-check.ts — append to QuickCheckAnswer union

export type QuickCheckAnswer =
  | { kind: "single-choice"; selectedIndex: number }
  | { kind: "multi-select"; selectedIndices: number[] }
  | { kind: "short-answer"; text: string }
  | { kind: "matching"; pairs: Array<{ leftId: string; rightId: string }> }
  | { kind: "confidence"; rating: number }
  | { kind: "structured-question"; answers: Array<{ questionIndex: number; selectedIndices: number[] }> } // ← new
  | { kind: "abandoned" };
```

**Implementation Notes**:
- `selectedIndices` (plural) handles both single- and multi-select. For
  single-select, the renderer enforces length-1; for multi-select,
  length ≥ 0 (allow zero — student skipped that question).
- `answers` is positional by `questionIndex` rather than keyed —
  matches the input shape's natural ordering and avoids a separate id
  field per question.
- Question-level `header` mirrors AskUserQuestion's `header` chip.

**Acceptance**:
- [ ] `StructuredQuestionItem` exported from `@praxis/core/types`.
- [ ] `AssignmentItem` union includes `StructuredQuestionItem`.
- [ ] `QuickCheckAnswer` union includes the `structured-question`
      variant.
- [ ] Workspace `pnpm typecheck` passes (every exhaustive switch on
      `AssignmentItem.kind` or `QuickCheckAnswer.kind` either handles
      the new case explicitly or has a `default` branch that doesn't
      error).

---

### Unit 2: `ask_student_question` tool

**File**: `packages/tools/src/dialog/ask-student-question.ts` (new file,
new `dialog/` directory under `packages/tools/src/`)

**Story**: `story-epic-bootstrap-readiness-structured-questions-tool`

```typescript
import type { StructuredQuestionItem, ToolDefinition } from "@praxis/core/types";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

const InputSchema = z.object({
  questions: z
    .array(
      z.object({
        header: z
          .string()
          .min(1)
          .max(40)
          .describe(
            "Very short label (max ~12 chars recommended) shown as a chip on the card. " +
              "Examples: 'Auth method', 'Library', 'Approach'.",
          ),
        prompt: z.string().min(1).describe("The full question shown above the options."),
        multiSelect: z
          .boolean()
          .default(false)
          .describe("When true, the student can pick more than one option."),
        options: z
          .array(
            z.object({
              label: z.string().min(1).describe("The display text the student sees and selects."),
              description: z
                .string()
                .optional()
                .describe("Explanation of what this option means or its trade-off."),
            }),
          )
          .min(2)
          .max(8),
      }),
    )
    .min(1)
    .max(4)
    .describe(
      "One to four structured questions, rendered as a stack on a single card. " +
        "Each question has its own option list and single-vs-multi-select flag.",
    ),
});

const OutputSchema = z.object({
  answers: z.array(
    z.object({
      questionIndex: z.number().int().nonnegative(),
      selectedIndices: z.array(z.number().int().nonnegative()),
    }),
  ),
  /** True if the student closed the card without answering. */
  abandoned: z.boolean().optional(),
});

export const askStudentQuestionTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "ask_student_question",
  description:
    "Ask the student one or more structured choice questions inline in the chat. Renders an interactive card with chip-labeled questions and labeled options; blocks until the student submits. Use when you need a decision the student must make for you to proceed — e.g. 'use the canonical pack, the textbook, or both?', 'merge these lessons or keep them separate?'. Do NOT use for assessment (use quick_check.* for formative checks). Do NOT use to pad turns with rhetorical questions. Each question has a short `header` chip, a `prompt`, a `multiSelect` flag, and 2-8 `options`. Up to 4 questions per call. If the student abandons the card, the tool returns `{ answers: [], abandoned: true }`.",
  input: InputSchema,
  output: OutputSchema,
  tier: "model-derived",
  effects: [],
  async handler(args, ctx) {
    const callId = uuidv7();
    const item: StructuredQuestionItem = {
      kind: "structured-question",
      id: callId,
      questions: args.questions.map((q) => ({
        header: q.header,
        prompt: q.prompt,
        multiSelect: q.multiSelect,
        options: q.options,
      })),
    };

    const answer = await ctx.services.quickCheck?.await({
      callId,
      sessionId: ctx.sessionId,
      item,
    });

    if (!answer || answer.kind === "abandoned") {
      return { answers: [], abandoned: true };
    }

    if (answer.kind !== "structured-question") {
      throw new Error(`unexpected answer kind: ${answer.kind}`);
    }

    return { answers: answer.answers };
  },
};
```

**Implementation Notes**:
- `max(4)` on `questions` prevents the model from pasting a giant
  branching tree into one call. Same limit as Claude Code's
  AskUserQuestion built-in.
- `min(2)` / `max(8)` on `options` enforces useful card density.
- Default `multiSelect: false` so the model can omit it for the common
  case.
- The handler is fire-and-await — no internal state. Service
  abandonment semantics inherit from `quick_check.*`.

**Acceptance**:
- [ ] Tool exported from `packages/tools/src/dialog/index.ts` and
      re-exported through `packages/tools/src/index.ts`.
- [ ] Schema validation rejects empty `questions`, zero/one option,
      more than 4 questions, more than 8 options per question.
- [ ] Handler returns `{ answers, abandoned? }` shape; abandoned path
      returns `{ answers: [], abandoned: true }`.
- [ ] Handler unit test: mock `ctx.services.quickCheck.await` to
      return a structured-question answer, verify the tool returns it
      unchanged.
- [ ] Handler unit test for the abandoned path.

---

### Unit 3: Register tool in registry and mode tool lists

**Files**:
- `packages/tools/src/index.ts` — export `askStudentQuestionTool`,
  include in the default registry array.
- `packages/curriculum/src/modes/bootstrap.ts` — add
  `"ask_student_question"` to `bootstrapMode.toolNames`.
- `packages/curriculum/src/modes/configure.ts` — add to
  `configureMode.toolNames` (configure subsumes bootstrap; should have
  the same tool).
- `packages/curriculum/src/modes/fragments/bootstrap-tools.ts` —
  document the tool in the bootstrap-mode prompt.

**Story**: `story-epic-bootstrap-readiness-structured-questions-tool`

Prompt fragment addition (concise; the per-tool descriptions live in
the Zod schema, not the prompt):

```markdown
- ask_student_question — ask the student a structured choice question
  (or up to 4 at once) when you need a decision before proceeding. Use
  this instead of guessing or apologising in text. Examples: choosing
  between two starting paths, picking a sub-topic to dive into,
  confirming a destructive action.
```

**Acceptance**:
- [ ] Tool is reachable via the registry — `registry.dispatch("ask_student_question", args)` works.
- [ ] `bootstrapMode.toolNames` includes `"ask_student_question"`.
- [ ] `configureMode.toolNames` includes `"ask_student_question"`.
- [ ] `bootstrapToolsFragment` mentions the tool in its "Tools
      available in bootstrap mode" prose.
- [ ] No other mode has the tool yet (teach/quiz/exam unchanged).

---

### Unit 4: `<StructuredQuestionCard />` component

**File**: `packages/ui/src/components/structured-question-card.tsx` (new)

**Story**: `story-epic-bootstrap-readiness-structured-questions-ui`

```tsx
import type { StructuredQuestionItem } from "@praxis/core/types";
import { useState, type JSX } from "react";
import styles from "./structured-question-card.module.css";

export interface StructuredQuestionCardProps {
  callId: string;
  item: StructuredQuestionItem;
  /** Called when the student submits. The card disables itself afterwards. */
  onResolve: (input: {
    callId: string;
    answer: {
      kind: "structured-question";
      answers: Array<{ questionIndex: number; selectedIndices: number[] }>;
    };
  }) => Promise<void> | void;
}

export function StructuredQuestionCard({
  callId,
  item,
  onResolve,
}: StructuredQuestionCardProps): JSX.Element {
  // selections[qIdx] is a Set of selected option indices for that question.
  const [selections, setSelections] = useState<Array<Set<number>>>(() =>
    item.questions.map(() => new Set<number>()),
  );
  const [submitted, setSubmitted] = useState(false);

  const toggle = (qIdx: number, optIdx: number): void => {
    if (submitted) return;
    setSelections((prev) => {
      const next = prev.map((s, i) => (i === qIdx ? new Set(s) : s));
      const set = next[qIdx]!;
      const multi = item.questions[qIdx]!.multiSelect;
      if (multi) {
        if (set.has(optIdx)) set.delete(optIdx);
        else set.add(optIdx);
      } else {
        set.clear();
        set.add(optIdx);
      }
      return next;
    });
  };

  const submit = async (): Promise<void> => {
    if (submitted) return;
    setSubmitted(true);
    const answers = selections.map((set, qIdx) => ({
      questionIndex: qIdx,
      selectedIndices: [...set].sort((a, b) => a - b),
    }));
    await onResolve({ callId, answer: { kind: "structured-question", answers } });
  };

  // Submit button enabled when every required question has at least one selection.
  // For non-multiSelect, "required" means one pick. For multiSelect, allow zero
  // (student can skip a question they don't want to answer).
  const canSubmit = item.questions.every((q, i) => q.multiSelect || selections[i]!.size === 1);

  return (
    <section className={styles.card} aria-label="Tutor question">
      {item.questions.map((q, qIdx) => (
        <fieldset key={qIdx} className={styles.question} disabled={submitted}>
          <legend className={styles.headerChip}>{q.header}</legend>
          <p className={styles.prompt}>{q.prompt}</p>
          <ul className={styles.options}>
            {q.options.map((opt, optIdx) => {
              const selected = selections[qIdx]!.has(optIdx);
              return (
                <li key={optIdx}>
                  <button
                    type="button"
                    className={selected ? styles.optionSelected : styles.option}
                    onClick={() => toggle(qIdx, optIdx)}
                    aria-pressed={selected}
                  >
                    <span className={styles.optionLabel}>{opt.label}</span>
                    {opt.description !== undefined && (
                      <span className={styles.optionDesc}>{opt.description}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
      <div className={styles.footer}>
        <button
          type="button"
          className={styles.submit}
          onClick={() => void submit()}
          disabled={!canSubmit || submitted}
        >
          {submitted ? "Submitted" : "Submit"}
        </button>
      </div>
    </section>
  );
}
```

**Implementation Notes**:
- Uses the editorial-ui-primitives CSS class convention: `composes:
  editorial from global;` on the card root for visual consistency.
- `aria-pressed` on option buttons gives screen readers the right
  state semantics for toggle-style choices.
- Submit-button gating: requires one pick per non-multiSelect
  question; allows zero picks per multiSelect question (skip is
  meaningful).
- After submit, the card disables all controls (`<fieldset disabled>`)
  and shows "Submitted" — visible record of the chosen answer.

**Acceptance**:
- [ ] Renders one fieldset per question with header chip, prompt, and
      options.
- [ ] Single-select questions: clicking a new option deselects the
      previous one.
- [ ] Multi-select questions: clicking a selected option deselects it;
      multiple can be selected.
- [ ] Submit button disabled until every non-multiSelect question has
      one pick.
- [ ] Clicking Submit calls `onResolve` with the correct
      `{ kind: "structured-question", answers }` shape (positional by
      questionIndex, selectedIndices sorted ascending).
- [ ] After submit, all buttons disabled; "Submitted" shown.
- [ ] Component renders without throwing for 1, 2, 3, and 4 questions
      (the schema bounds).

---

### Unit 5: Render `<StructuredQuestionCard />` in chat tab body

**File**: `packages/ui/src/components/chat-tab-body.tsx`

**Story**: `story-epic-bootstrap-readiness-structured-questions-ui`

Inside the existing `quickChecks.map((check) => …)` rendering block
(or a sibling block), switch on `check.item.kind`:

```tsx
{quickChecks.map((check) => {
  if (check.item.kind === "structured-question") {
    return (
      <StructuredQuestionCard
        key={check.callId}
        callId={check.callId}
        item={check.item}
        onResolve={resolveQuickCheck}
      />
    );
  }
  return (
    <QuickCheckCard
      key={check.callId}
      callId={check.callId}
      item={check.item}
      onResolve={resolveQuickCheck}
    />
  );
})}
```

**Acceptance**:
- [ ] When a `structured-question` quick-check fires, the card renders
      inside the same `quickChecks` stack as other quick-check cards.
- [ ] Submitting routes through the same `resolveQuickCheck` path —
      no new IPC channel.
- [ ] Existing quick-check cards continue to render correctly (the
      switch falls through for non-structured-question kinds).

---

### Unit 6: Tests

**Story**: `story-epic-bootstrap-readiness-structured-questions-tool`
(backend) + `story-epic-bootstrap-readiness-structured-questions-ui`
(frontend).

**Backend tests** (`packages/tools/src/dialog/__tests__/ask-student-question.test.ts`):
- Schema validation: rejects empty `questions`, zero/one option, more
  than 4 questions, more than 8 options.
- Schema validation: accepts valid inputs (single question, 4 questions,
  multiSelect true/false).
- Handler: mocks `ctx.services.quickCheck.await` to return a structured
  answer; verifies the tool returns the answers unchanged.
- Handler: abandoned path returns `{ answers: [], abandoned: true }`.
- Handler: wrong-kind answer throws (defensive).

**Backend end-to-end test** (`packages/core/src/__tests__/quick-check-service-structured.test.ts`):
- Spawn handler call → service emits `pending` → resolve with
  structured-question answer → handler Promise resolves with the
  answer.

**Frontend tests** (`packages/ui/src/components/__tests__/structured-question-card.test.tsx`):
- Renders with N questions; each shows header chip + prompt + options.
- Single-select toggle replaces selection; multi-select toggle adds/removes.
- Submit button gated by per-question requirements.
- Submit calls `onResolve` with sorted `selectedIndices` and correct
  `questionIndex` mapping.
- After submit, controls disabled and "Submitted" shown.

## Implementation Order

1. **Unit 1** (type unions) — foundation.
2. **Unit 2** (tool) — depends on Unit 1.
3. **Unit 3** (registry + mode + prompt) — depends on Unit 2.
4. **Unit 4** (card component) — depends on Unit 1.
5. **Unit 5** (chat integration) — depends on Unit 4.
6. **Unit 6** (tests) — co-developed.

Units 1-3 land under the **tool** story. Units 4-5 land under the **ui**
story. Units 1's types are exported from `@praxis/core/types`, so the
ui story can wait for the tool story (which lands the types) to be at
review, OR — equivalently — start with placeholder types and switch to
the real ones when the tool story lands. Declaring the dep edge
(`ui → tool`) is cleaner; orchestrator handles the sequencing.

## Testing

(See Unit 6 for the full breakdown.)

## Risks

- **`AssignmentItem` union overload.** This union is shared between
  formal assessment items (math problems, free-response, code) and
  quick-check items (single-choice, multi-select, …). Adding
  `structured-question` stretches the abstraction — it's not really
  an assessment item. Mitigation: document this in the
  `StructuredQuestionItem` JSDoc; if a third non-assessment item kind
  shows up later, refactor to a parent union
  (`AssignmentItem | DialogPrompt`) and let the QuickCheckService
  accept either. Not a v1 blocker.
- **Question / option count limits.** 4 questions × 8 options =
  reasonable card density. If the model wants more, it has to call
  twice. This is intentional — pressuring the model to chunk
  decisions keeps the UI readable. Document in the tool description.
- **Prompt friction.** The model may continue to apologise in text
  ("I'll proceed with X") instead of calling the tool. Mitigation: the
  prompt-fragment story (`story-bootstrap-prompt-no-inline-outline`)
  is updating the bootstrap prompts anyway; piggyback a one-line "use
  `ask_student_question` when you need a decision" reminder in the
  same edit. Cross-reference in implementation notes.

## Documentation roll-forward

When this feature lands, update:
- `docs/CONTRACT.md` — add `ask_student_question` to the tool listing
  (sibling to the `quick_check.*` family). Note it's in `bootstrap`
  and `configure` modes.
- `docs/SPEC.md:111` — no change needed; the section already
  anticipates "multi-step approval flows, disambiguation prompts" and
  this tool slots in.
