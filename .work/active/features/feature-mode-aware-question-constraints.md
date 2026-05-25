---
id: feature-mode-aware-question-constraints
kind: feature
stage: review
tags: [content, tool-schema, agent-prompt, cross-package]
parent: epic-educational-content-rendering
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Mode-aware question-tool constraints + agent prompt fragment

## Brief

Cross-package work spanning `@praxis/curriculum` (mode definitions) and `@praxis/tools` (tool dispatch + validation) plus the agent-prompt-fragment plumbing that introduces the question tool to the agent each turn. The `ask_student_question` (and quick-check) Zod schemas become dynamic per mode — different modes carry different question density tolerances, and the agent reads the constraints for whichever mode it's in via system prompt fragment interpolation.

Proposed per-mode defaults (refine at design time):

| Mode | Prompt max | Choice max | Count | Multi cap |
|---|---|---|---|---|
| teach (quick-check) | 30 words | 10 words | 4 | 4 |
| homework / quiz / exam | 60 words | 25 words | 5 | 6 |
| course-create / configure | 50 words | 15 words | 5 | 6 |
| study-skills | 40 words | 12 words | 4 | 4 |

Implementation has three pieces: (1) `@praxis/curriculum` mode definition shape gets `questionConstraints?: { promptMaxWords, choiceMaxWords, choiceCount, multiSelectCap }`; (2) `@praxis/tools` `ask_student_question` handler reads active mode from `ToolContext`, validates against the resolved caps, returns descriptive errors that teach the constraint ("Choice text too long for teach mode — keep choices to ~10 words; longer reasoning belongs in the preceding tutor turn"); (3) the mode prompt fragment interpolates the per-mode caps AND the math-wrapping instruction from the sibling math-rendering feature — one fragment, two pieces of agent guidance, delivered together for whichever mode is active.

In scope: schema validation, mode-config schema change, the unified question-tool prompt fragment. Out of scope: the question chassis visual itself (lives in `feature-question-panel-rework` which depends on this feature for its design pass); the math-rendering pipeline (sibling feature); the broader content-renderer pipeline (sibling feature).

## Epic context

- Parent epic: `epic-educational-content-rendering`
- Position in epic: **agent-side companion** to the renderer features. The renderer features (`feature-content-renderer-pipeline`, `feature-math-rendering`) handle the UI side of educational content; this feature handles the AGENT side — telling the agent what shape its output should take so the renderer gets sensible input.

## Cross-epic dependency

This feature is a hard `depends_on` for `feature-question-panel-rework` (sibling epic `epic-chat-interaction-ux-overhaul`). The question chassis design pass needs the per-mode caps locked in before it can finalize layout, paging chrome, and selected-state typography against realistic content limits.

## Mockups

- Inherits design system: `.mockups/design-system/{tokens,motion,components}.css`
- Proposed treatments (renderer side, for reference): `.mockups/design-system/content-types.html` § Math (LaTeX-wrapping instruction the fragment will carry), § Callouts (admonition syntax the fragment will teach), § Citations (tool-call convention the fragment will document).
- Question chassis surfaces this feeds: `.mockups/screens/feature-question-panel-rework/responsive-showcase.html` (the dense stress-test that surfaced the need for caps) and `.mockups/screens/feature-question-panel-rework/state-single.html` / `state-multi-select.html` / `state-paged.html` (the chassis that will consume the caps).

## Foundation references

- `docs/ARCHITECTURE.md` § `@praxis/curriculum`, `@praxis/tools` — the two packages this feature touches.
- `.claude/rules/patterns.md` § `mode-prompt-fragment-composition` — the existing pattern this feature extends. Fragment composition by id+position; this feature adds one new fragment that interpolates per-mode constraint values.
- Epic body § "Agent contract — markup conventions + parser strategy" — full mapping of what the unified prompt fragment teaches (the agent-side surface this feature owns).

## Design decisions

*(captured 2026-05-24 via `feature-design --only-questions`. These lock in directional choices so the full design pass inherits them.)*

- **Enforcement: hard reject with descriptive error**. Over-cap calls fail via Zod validation; the failure returns a `tool_result` whose error message is written for the agent to learn from ("Choice text too long for teach mode — keep choices to ~10 words; longer reasoning belongs in the preceding tutor turn"). Same model as every other Zod-validated tool in the project. Most reliable: the agent CAN'T accidentally overshoot. No silent soft-warn path; no dev-reports double-track (the rejection IS the signal).

- **Tool scope: shared schema with per-tool override**. `@praxis/curriculum` mode definitions carry ONE `questionConstraints?: { promptMaxWords, choiceMaxWords, choiceCount, multiSelectCap }` shape. Each question-emitting tool (`ask_student_question`, the quick-check variant, the drafter's question tool, any future ones) reads this shape by default. A tool can override specific caps in its own Zod schema where there's a tool-specific reason — e.g., a long-form drafter authoring tool that legitimately needs looser choice caps for review questions. Single source of truth at the mode layer; tool-specific exceptions handled at the tool layer.

- **Per-mode default values: locked now, but in a single-file constant for easy tuning**. Adopt the proposed table as authoritative starting values:

  | Mode | Prompt max | Choice max | Count | Multi cap |
  |---|---|---|---|---|
  | teach (quick-check) | 30 words | 10 words | 4 | 4 |
  | homework / quiz / exam | 60 words | 25 words | 5 | 6 |
  | course-create / configure | 50 words | 15 words | 5 | 6 |
  | study-skills | 40 words | 12 words | 4 | 4 |

  Values live in a single constant in `@praxis/curriculum` (e.g., `DEFAULT_QUESTION_CONSTRAINTS_BY_MODE` in a single file) so future tuning is a one-file developer edit, not a per-mode-file hunt. NOT user-configurable via UI — these are agent-behavior dials, not student settings. If production usage surfaces friction, the constant gets updated in a follow-up release.

- **Prompt fragment shape: one unified question-tool fragment with all guidance**. A single fragment composed into every mode's system prompt. Interpolates the per-mode caps inline + carries ALL the cross-cutting markup conventions from the epic's agent-contract section: LaTeX math wrapping (from sibling `feature-math-rendering`), citation tool usage, definition markup via `[[def:term]]`, callout admonitions, concept refs via `concept:slug`, figures via `::: figure :::` directive. Agent reads ONE coherent "how to write questions and educational content" reference each turn. Maintenance: one fragment file, one source of truth — sibling features contribute their content via PRs to that same file rather than fragmenting into separate per-concern fragments.

## Cross-feature coordination

The shared mode-config + the unified prompt fragment mean this feature touches surfaces that sibling features ALSO want to touch:

- `@praxis/curriculum` mode shape: this feature adds `questionConstraints?`; `feature-content-renderer-pipeline` adds `renderToggles?`. Both extensions are additive; coordinate file changes at design-pass time.
- Unified prompt fragment: this feature creates it; `feature-math-rendering` contributes the LaTeX section; `feature-content-renderer-pipeline` contributes the markup convention sections. Design-pass coordination via shared fragment file.

## Architectural choice

**Validation runs in the tool handler against constraints threaded through `ToolContext`, not via dynamic per-mode Zod schemas.** The Zod input schema stays static — it accepts the maximum across all modes (essentially a sanity ceiling). Per-mode caps enforce at handler entry via a shared `validateQuestionConstraints(args, resolved): ValidationResult` helper. Violations return a `ToolResult.failure` whose `error.message` is written for the agent to learn from (matches the "tool_result error the agent reads" goal in the design decision).

`ToolContext` gains an optional `questionConstraints: Required<QuestionConstraints>` field, populated by `SessionServiceImpl` when building the call context. Each session resolves once at open: looks up its mode → merges `mode.questionConstraints` with `DEFAULT_QUESTION_CONSTRAINTS_BY_MODE[mode.id]` → seeds the call context. Tool handlers read `ctx.questionConstraints` and pass to the helper. Per-tool override is the schema decoration pattern (e.g., a tool that overrides via `overrideConstraints?: Partial<QuestionConstraints>` in its own input schema — merged at the validation step).

The mode prompt fragment is a **factory** (matches the `mode-prompt-fragment-composition` pattern with parameterized fragments). `questionToolFragment(constraints): PromptFragment` returns a constraints-position fragment whose template interpolates the per-mode caps + all cross-cutting markup conventions from the parent epic's agent-contract section (LaTeX math, citations, definitions, callouts, concept refs, figures). Each mode that uses question tools calls this factory with its resolved constraints.

Rejected alternatives:
- **Dynamic per-mode Zod schemas built at dispatch** — clever but non-idiomatic for the project; static Zod + handler-level checks reads cleaner and matches `assignment/item-schema.ts`'s `.refine` precedent.
- **Constraint check in the tool registry's dispatch layer** — leaks tool-specific concern up into the registry; better to keep it in each tool's handler with a shared helper for the actual check.
- **Mode lookup at every tool call (via sessionId → session row → modeId → getMode)** — extra DB query per call; threading constraints into ToolContext at session-open time is O(1) per call.

## Implementation Units

### Unit 1: `QuestionConstraints` type + `DEFAULT_QUESTION_CONSTRAINTS_BY_MODE` constant
**File**: `packages/core/src/types/mode.ts` (extend), `packages/curriculum/src/question-constraints.ts` (NEW)
**Story**: `feature-mode-aware-question-constraints-step-1-types-and-defaults`

```typescript
// packages/core/src/types/mode.ts — extend
export interface QuestionConstraints {
  promptMaxWords?: number;        // default per mode
  choiceMaxWords?: number;        // default per mode
  choiceCount?: number;           // max number of choices per question
  multiSelectCap?: number;        // max number of selections in multi-select questions
}

export interface Mode {
  // ...existing fields
  questionConstraints?: QuestionConstraints;  // NEW
}

// packages/curriculum/src/question-constraints.ts — NEW
export const DEFAULT_QUESTION_CONSTRAINTS_BY_MODE: Record<string, Required<QuestionConstraints>> = {
  teach:          { promptMaxWords: 30, choiceMaxWords: 10, choiceCount: 4, multiSelectCap: 4 },
  homework:       { promptMaxWords: 60, choiceMaxWords: 25, choiceCount: 5, multiSelectCap: 6 },
  quiz:           { promptMaxWords: 60, choiceMaxWords: 25, choiceCount: 5, multiSelectCap: 6 },
  exam:           { promptMaxWords: 60, choiceMaxWords: 25, choiceCount: 5, multiSelectCap: 6 },
  "course-create":{ promptMaxWords: 50, choiceMaxWords: 15, choiceCount: 5, multiSelectCap: 6 },
  configure:      { promptMaxWords: 50, choiceMaxWords: 15, choiceCount: 5, multiSelectCap: 6 },
  "study-skills": { promptMaxWords: 40, choiceMaxWords: 12, choiceCount: 4, multiSelectCap: 4 },
};

export const FALLBACK_QUESTION_CONSTRAINTS: Required<QuestionConstraints> = {
  promptMaxWords: 60, choiceMaxWords: 25, choiceCount: 5, multiSelectCap: 6,
};

export function resolveQuestionConstraints(
  modeId: string,
  override?: QuestionConstraints,
): Required<QuestionConstraints> {
  const base = DEFAULT_QUESTION_CONSTRAINTS_BY_MODE[modeId] ?? FALLBACK_QUESTION_CONSTRAINTS;
  return { ...base, ...(override ?? {}) };
}
```

**Implementation notes**:
- The constants file is the single source of truth for tuning. Future updates = one-file edit.
- `resolveQuestionConstraints` merges per-mode defaults under any `mode.questionConstraints` override.
- `FALLBACK_QUESTION_CONSTRAINTS` covers any mode not in the lookup (defensive — should never hit in practice since all modes register).
- Unit tests in `packages/curriculum/src/__tests__/question-constraints.test.ts` cover: every mode resolves; unknown mode falls back; override merges correctly.

**Acceptance criteria**:
- [ ] `QuestionConstraints` interface exported with 4 optional number fields
- [ ] `Mode.questionConstraints?: QuestionConstraints` added
- [ ] `DEFAULT_QUESTION_CONSTRAINTS_BY_MODE` covers all 7 existing modes with the documented values
- [ ] `resolveQuestionConstraints(modeId, override?)` merges correctly
- [ ] Unknown mode falls back to `FALLBACK_QUESTION_CONSTRAINTS`
- [ ] All existing modes typecheck unchanged (field is optional)
- [ ] Unit tests cover each defaults-table entry + merge cases

---

### Unit 2: `ToolContext.questionConstraints` threading from SessionService
**File**: `packages/core/src/types/tool.ts` (extend), `packages/core/src/services/session-service.ts` or `packages/core/src/services/session/engine-session-manager.ts` (modify call-context build)
**Story**: `feature-mode-aware-question-constraints-step-2-toolcontext-threading`

```typescript
// packages/core/src/types/tool.ts — extend
export interface ToolContext {
  // ...existing fields (sessionId, courseId, assignmentId, draftId, parentSessionId, services, log, etc.)
  questionConstraints?: Required<QuestionConstraints>;  // NEW — resolved at session-open
}
```

**Implementation notes**:
- In `SessionServiceImpl.openActive(...)` (or `EngineSessionManager.openActive` — locate via grep), after the mode is loaded, resolve constraints once via `resolveQuestionConstraints(mode.id, mode.questionConstraints)` and stash on the entry.
- When building the per-turn `callContext` for the registry's `dispatch`, include `questionConstraints` from the entry.
- Optional, not required — for sessions whose mode doesn't use question tools (rare), undefined is fine.
- Existing tests should pass; new test asserts that a freshly opened session's call context carries the right constraints for its mode.

**Acceptance criteria**:
- [ ] `ToolContext.questionConstraints?` field added
- [ ] `SessionServiceImpl` (or session-manager) resolves constraints at open and stashes them
- [ ] Call context build includes `questionConstraints` for every dispatch
- [ ] Test: opening a teach session yields ToolContext with teach defaults
- [ ] Test: opening a session whose mode has `questionConstraints: { choiceCount: 3 }` yields merged result
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green

---

### Unit 3: Shared `validateQuestionConstraints` helper
**File**: `packages/tools/src/dialog/validate-question-constraints.ts` (NEW)
**Story**: `feature-mode-aware-question-constraints-step-3-validation-helper`

```typescript
import type { Required } from "...";
import type { QuestionConstraints } from "@praxis/core/types";

export interface QuestionPayloadForValidation {
  prompt: string;
  options: Array<{ label: string } | string>;
  multiSelect?: boolean;
}

export interface ValidationFailure {
  ok: false;
  code: "QUESTION_CONSTRAINT_VIOLATION";
  message: string;   // written for the agent to learn from
  field: "prompt" | "options" | "choiceCount" | "multiSelectCap";
}

export type ValidationResult =
  | { ok: true }
  | ValidationFailure;

export function validateQuestionConstraints(
  payload: QuestionPayloadForValidation,
  constraints: Required<QuestionConstraints>,
  modeLabel: string,
): ValidationResult {
  const promptWords = countWords(payload.prompt);
  if (promptWords > constraints.promptMaxWords) {
    return {
      ok: false,
      code: "QUESTION_CONSTRAINT_VIOLATION",
      field: "prompt",
      message: `Question prompt too long for ${modeLabel} mode (${promptWords} words; max ${constraints.promptMaxWords}). Trim to the essential framing; move reasoning into the preceding tutor turn.`,
    };
  }
  if (payload.options.length > constraints.choiceCount) {
    return {
      ok: false,
      code: "QUESTION_CONSTRAINT_VIOLATION",
      field: "choiceCount",
      message: `Too many choices for ${modeLabel} mode (${payload.options.length}; max ${constraints.choiceCount}). Cut to the most discriminating options.`,
    };
  }
  for (let i = 0; i < payload.options.length; i++) {
    const labelText = typeof payload.options[i] === "string"
      ? (payload.options[i] as string)
      : (payload.options[i] as { label: string }).label;
    const labelWords = countWords(labelText);
    if (labelWords > constraints.choiceMaxWords) {
      return {
        ok: false,
        code: "QUESTION_CONSTRAINT_VIOLATION",
        field: "options",
        message: `Choice ${i + 1} text too long for ${modeLabel} mode (${labelWords} words; max ${constraints.choiceMaxWords}). Compress to the choice's distinguishing feature; longer reasoning belongs in the preceding tutor turn.`,
      };
    }
  }
  // multiSelectCap not enforced at validation time — that's the *answer* cap, not the question shape
  return { ok: true };
}

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}
```

**Implementation notes**:
- Word count = whitespace-split, ignoring leading/trailing whitespace. Markdown inline like `**bold**` counts as one word.
- Error messages are written **for the agent** — second-person, instructive, suggests the correct action.
- `multiSelectCap` is the cap on the student's _answer_ (how many selections allowed), not the question shape. Enforce at the multi-select handler's answer-validation step, not here.
- Helper is package-internal to `@praxis/tools` (not exported beyond it).

**Acceptance criteria**:
- [ ] Helper accepts string or `{label}` option shapes
- [ ] Returns success when within all caps
- [ ] Returns failure for over-cap prompt with descriptive message
- [ ] Returns failure for over-cap choice count
- [ ] Returns failure for per-choice over-cap with index in message
- [ ] `countWords` handles leading/trailing whitespace and empty
- [ ] `packages/tools/src/dialog/__tests__/validate-question-constraints.test.ts` covers every branch with table-driven tests

---

### Unit 4: `questionToolFragment` factory
**File**: `packages/curriculum/src/modes/fragments/question-tool.ts` (NEW)
**Story**: `feature-mode-aware-question-constraints-step-4-prompt-fragment`

```typescript
import type { PromptFragment, QuestionConstraints } from "@praxis/core/types";

export function questionToolFragment(
  constraints: Required<QuestionConstraints>,
  modeLabel: string,
): PromptFragment {
  return {
    id: "question-tool-guidance",
    position: "constraints",
    customizable: false,
    template: `## Questions and educational content

When using the question tools (\`ask_student_question\`, \`quick_check.*\`), respect these caps for ${modeLabel} mode:
- Question prompt: max ${constraints.promptMaxWords} words
- Each choice text: max ${constraints.choiceMaxWords} words
- Up to ${constraints.choiceCount} choices per question
- Multi-select: students may select up to ${constraints.multiSelectCap}

Over-cap calls fail with a descriptive error you can correct from. Compress to the essential framing; longer reasoning belongs in the preceding tutor turn.

## Content conventions

### Math
- Inline: \`$f(x) = x^2$\`
- Display: \`$$\\frac{dV}{dt} = ...$$\`
- Bare unicode glyphs (∂, ∫, π, α, etc.) are auto-styled but use LaTeX for full typesetting

### Citations
Call the \`citation\` tool with \`source_id\` and \`passage\`. Do NOT inline-write \`[Stewart §3.5]\` markup — the tool emits the chip.

### Definitions
Wrap first-introduction terms in \`[[def:term-name]]\`. The renderer styles the first occurrence per student and falls through on subsequent mentions.

### Callouts
Use GitHub admonition syntax: \`> [!theorem]\`, \`> [!lemma]\`, \`> [!hint]\`, \`> [!warning]\`. One register per moment.

### Concept references
Link with the \`concept:\` scheme: \`[chain rule](concept:chain-rule)\`.

### Figures
For worked examples, use a container directive:
\`\`\`
::: figure {caption="Fig. 1 · convergence near x=0" verdict="ok"}
<figure body — markdown, math, etc.>
:::
\`\`\`
`,
  };
}
```

**Implementation notes**:
- Position is `"constraints"` — slots in after the role/principles/tools sections, before user-global.
- `customizable: false` — these are framework-level instructions; users shouldn't override them (the `customizable` precedent in `compose.ts:63` enforces this).
- Template is plain text with backtick code fences for examples — agent-readable.
- The content-conventions section is the **single SOT** for cross-cutting markup conventions; sibling features (`feature-math-rendering`, `feature-content-renderer-pipeline`) contribute their sections by editing this fragment, not by adding new fragments.
- Future additions go here. Discoverability win.

**Acceptance criteria**:
- [ ] Factory returns a `PromptFragment` with `id: "question-tool-guidance"`, position `"constraints"`, `customizable: false`
- [ ] Template interpolates `constraints.promptMaxWords`, `choiceMaxWords`, `choiceCount`, `multiSelectCap` correctly
- [ ] Template includes math, citations, definitions, callouts, concept refs, figures sections
- [ ] Unit test: factory output for teach constraints contains "max 30 words" and "max 10 words"
- [ ] Unit test: factory output for exam constraints differs from teach (60 / 25 vs 30 / 10)

---

### Unit 5: Wire validation into `ask_student_question` handler
**File**: `packages/tools/src/dialog/ask-student-question.ts`
**Story**: `feature-mode-aware-question-constraints-step-5-ask-student-question-wire`

**Implementation notes**:
- In the handler, **before** awaiting QuickCheckService, iterate `args.questions` and validate each with `validateQuestionConstraints(question, ctx.questionConstraints ?? FALLBACK_QUESTION_CONSTRAINTS, modeLabel)`.
- On the first failure, return `{ ok: false, error: { code: "QUESTION_CONSTRAINT_VIOLATION", message: failure.message } }` — short-circuit; don't enqueue any questions.
- Add tests in `packages/tools/src/dialog/__tests__/ask-student-question.test.ts`:
  - Over-cap prompt fails with descriptive message
  - Over-cap choice fails with descriptive message + correct index
  - Within-cap call succeeds (no change to existing behavior)
  - Mixed valid-then-invalid questions: fails on first invalid, no partial enqueue

**Acceptance criteria**:
- [ ] Handler validates every question in the `questions` array
- [ ] Over-cap returns failure tool-result with descriptive message
- [ ] Within-cap is unchanged behavior (existing tests still pass)
- [ ] Short-circuits on first failure (no partial side effects)
- [ ] Tests cover prompt over-cap, choice over-cap, choice-count over-cap

---

### Unit 6: Wire validation into `quick_check.*` handlers
**File**: `packages/tools/src/quick-check/single-choice.ts`, `multi-select.ts`, `short-answer.ts`, `matching.ts`, `confidence.ts`
**Story**: `feature-mode-aware-question-constraints-step-6-quick-check-wire`

**Implementation notes**:
- Each quick_check variant has a slightly different schema. Apply validation appropriately:
  - `single-choice`, `multi-select`, `matching`: validate prompt + options/items per the helper
  - `short-answer`: validate prompt only (no options); `choiceCount` doesn't apply
  - `confidence`: validate prompt only (the choices are domain-fixed: "high / medium / low")
- The helper accepts string-or-object options; quick_check uses `string[]` for `options` so map to the right shape.
- Add tests in `packages/tools/src/quick-check/__tests__/`:
  - One per-variant over-cap prompt test
  - For variants with choices: over-cap choice test
- Mirror the short-circuit behavior of `ask_student_question`.

**Acceptance criteria**:
- [ ] All 5 quick_check variants validate against `ctx.questionConstraints`
- [ ] Over-cap returns descriptive failure tool-result
- [ ] Tests cover each variant's failure path + within-cap success
- [ ] No regression on existing quick_check tests

---

### Unit 7: Per-mode wiring — backfill + fragment registration
**File**: Every file under `packages/curriculum/src/modes/` that uses question tools (teach.ts, quiz.ts, homework.ts, exam.ts, course-create.ts, study-skills.ts; possibly configure.ts)
**Story**: `feature-mode-aware-question-constraints-step-7-mode-wiring`

**Implementation notes**:
- For each mode that uses question tools, **register** the new fragment:
  - Append `questionToolFragment(resolveQuestionConstraints(mode.id, mode.questionConstraints), mode.label)` to `mode.promptFragments`
  - Verify position-`constraints` slot doesn't collide with an existing fragment; if so, rename or merge
- Backfill `mode.questionConstraints` only where the default needs overriding — most modes inherit defaults via `DEFAULT_QUESTION_CONSTRAINTS_BY_MODE`. Leave fields undefined where the default is correct.
- For modes that explicitly don't use question tools (configure, possibly others — verify), do NOT register the fragment.
- Backfill task: read each mode file, decide constraints, register fragment.
- Add integration tests in `packages/curriculum/src/__tests__/mode-question-fragment.test.ts`:
  - Each question-using mode includes `questionToolGuidance` fragment after composition
  - Composed system prompt for teach mode contains "max 30 words"
  - Composed system prompt for exam mode contains "max 60 words"
  - Non-question-using modes don't include the fragment

**Acceptance criteria**:
- [ ] All question-using modes register `questionToolFragment`
- [ ] `composeSystemPrompt` for each mode includes the fragment text with correct caps
- [ ] Non-question-using modes don't include it
- [ ] Integration tests pass
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green

---

## Implementation Order

1. **step-1-types-and-defaults** (deps: `[]`) — type + defaults + resolver
2. **step-2-toolcontext-threading** (deps: `[step-1]`) — ToolContext gains field; SessionService threads
3. **step-3-validation-helper** (deps: `[step-1]`) — shared validator
4. **step-4-prompt-fragment** (deps: `[step-1]`) — `questionToolFragment` factory
5. **step-5-ask-student-question-wire** (deps: `[step-2, step-3]`)
6. **step-6-quick-check-wire** (deps: `[step-2, step-3]`)
7. **step-7-mode-wiring** (deps: `[step-1, step-4]`) — register fragment in every relevant mode

Parallel-friendly: step-1 unlocks 2/3/4 in parallel; 5/6 fan out after 2+3; 7 after 1+4. Steps 5/6/7 can all run in parallel once their deps land.

## Testing

### Unit tests (per story)
- `packages/curriculum/src/__tests__/question-constraints.test.ts` — defaults + resolver
- `packages/tools/src/dialog/__tests__/validate-question-constraints.test.ts` — every branch
- `packages/tools/src/dialog/__tests__/ask-student-question.test.ts` (extend) — over-cap paths
- `packages/tools/src/quick-check/__tests__/*-tool.test.ts` (extend each variant) — over-cap paths
- `packages/curriculum/src/modes/fragments/__tests__/question-tool.test.ts` — factory output
- `packages/curriculum/src/__tests__/mode-question-fragment.test.ts` — composed prompts contain correct caps

### Integration
- Tool-dispatch end-to-end: open session in teach mode → dispatch `ask_student_question` with 50-word prompt → expect failure with "max 30 words" message
- Cross-mode: dispatch same call in exam mode → expect success (60 cap)

### Test helpers
- `makeToolContext` (`tests/helpers/tool-context.ts`) — extend with optional `questionConstraints` field defaulting to FALLBACK
- Pattern: `temp-db-test-helper`, `shared-test-fake-factories`

## Risks

- **`configure` mode question-tool usage unknown.** The Explore agent's map says configure doesn't list question tools, but worth double-checking with grep before deciding whether to register the fragment. **Mitigation**: step-7 lists every mode + its question-tool usage explicitly before wiring.

- **Existing modes don't include the `constraints`-position fragment slot today.** Adding one may interact with the fragment-order assertion in `composeSystemPromptWithAttribution`. **Mitigation**: integration test asserts the composed prompt under teach mode contains the question-tool fragment AND no FRAGMENT_ORDER violations are thrown.

- **`mode.label` may not be agent-facing.** The validation helper uses `modeLabel` in error messages. If `mode.label` is the internal id ("teach") rather than human label ("Teach"), agent error reads weirdly. **Mitigation**: use `mode.displayName` if available, falling back to `mode.label`, falling back to `mode.id`. Check mode interface field for the best agent-facing string.

- **Course-create's `ask_student_question` is the drafter's flow control.** Drafter uses these calls to pause-and-confirm with the user during course creation. Caps too tight here would block valid drafter behavior. **Mitigation**: course-create defaults (50/15/5/6) are generous; verify against existing drafter usage in production (`packages/core/src/services/course-create/` — flag any draft-time message that exceeds caps as a Risk to address before this feature lands).

- **First-message validation timing.** The handler validates after Zod parse but before any side effect. Mid-call failure mid-iteration could leak partial state. **Mitigation**: validate all questions in `ask_student_question` upfront BEFORE any QuickCheckService.enqueue call. Confirmed in Unit 5 acceptance.

## Implementation summary (2026-05-24)

All 7 child stories landed across multiple autopilot orchestrator runs:

- `step-1-types-and-defaults` (done, commit `021e8bc`) — `QuestionConstraints` interface + `DEFAULT_QUESTION_CONSTRAINTS_BY_MODE` + `resolveQuestionConstraints` resolver.
- `step-3-validation-helper` (done, commit `8f7909f`) — `validateQuestionConstraints` shared helper with agent-friendly error messages; 30 tests.
- `step-4-prompt-fragment` (done, commit `6739b17`) — `questionToolFragment` factory at `position: "constraints"`, includes all 6 markup-convention sections from the agent contract.
- `step-2-toolcontext-threading` (commit `e977538`) — `ToolContext.questionConstraints?: Required<QuestionConstraints>` threaded through `EngineSessionManager.openActive`; per-turn ToolContext picks it up via `InProcessToolRegistry`'s shallow-copy of the base context (no registry changes needed).
- `step-7-mode-wiring` (commit `80f1205`) — 6 modes register `questionToolFragment`: teach, quiz, homework, exam, course-create, study-skills. `configure` excluded (configurator-facing, no `quick_check.*`). 22 new tests asserting per-mode cap interpolation.
- `step-5-ask-student-question-wire` (commit `15c7ab2`) — handler validates each question upfront, throws agent-friendly error on first violation; short-circuits no partial side effects. 5 new tests.
- `step-6-quick-check-wire` (commit `220e4d3`) — all 5 quick_check variants wired (single-choice, multi-select, short-answer, matching, confidence). Matching uses two-pass validation for left+right columns. 15 new tests.

**Cross-cutting deviations**:
- `INLINE_FALLBACK_CONSTRAINTS` defined inline in each tool file (ask-student-question.ts + 5 quick-check variants) rather than imported from `@praxis/curriculum` — respects the `@praxis/tools` → no-runtime-`@praxis/curriculum` dep rule. Value mirrors curriculum constant; flagged in source comments as intentional duplication.
- `modeLabel` resolves via `ctx.modeId ?? "current"` (e.g., "teach mode") rather than `mode.displayName` — `ToolContext` doesn't carry the display name, and `modeId` reads cleanly in agent error messages.
- step-7 used `DEFAULT_QUESTION_CONSTRAINTS_BY_MODE[key] ?? FALLBACK_QUESTION_CONSTRAINTS` to satisfy `noUncheckedIndexedAccess`; step-2's agent also caught + fixed this typecheck violation during parallel run.
- Wave-1 parallel execution: step-2 and step-7 both touched the curriculum mode files independently; both agents arrived at the same `noUncheckedIndexedAccess` fix. Clean convergence.

**Verification at advance time**: full workspace typecheck green; `pnpm test` — 5060 passed, 24 skipped (slow Pyodide tests). All 7 stories' acceptance criteria met.

What's now possible: every question-emitting tool now validates against per-mode caps at dispatch time. Over-cap calls return agent-friendly tool_result errors instructing the agent how to correct (trim prompts, compress choices, cut counts). Per-mode caps are visible to the agent via the unified prompt fragment composed into 6 mode system prompts.
