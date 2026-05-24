# Pattern: Agent Prompt Sidecar

For each LLM agent that has a non-trivial system prompt (indexers, rubric grader, approach-feedback grader), the prompt string lives in its own sibling `<name>-prompt.ts` file exporting a single `const NAME_SYSTEM_PROMPT = "..."`.

## Rationale

System prompts grow to dozens of lines with few-shot examples; embedding them in the agent file balloons it and obscures the prompt-editing workflow. The sidecar makes prompt tuning a one-file edit, lets prompts be unit-tested or snapshotted independently, and keeps the agent file focused on the inference plumbing.

## Examples

### Example 1: AffectiveIndexer prompt

**File**: `packages/core/src/services/indexers/affective-prompt.ts:4`

```ts
export const AFFECTIVE_SYSTEM_PROMPT = `You are a learning-science analyst. Read a tutoring-session transcript...`;
```

Used at `affective-indexer.ts:178`.

### Example 2: MisconceptionIndexer prompt

**File**: `packages/core/src/services/indexers/misconception-prompt.ts:4`

```ts
export const MISCONCEPTION_SYSTEM_PROMPT = `You are a learning-science analyst...`;
```

### Example 3: ConceptMapDivergenceIndexer prompt

**File**: `packages/core/src/services/indexers/concept-map-divergence-prompt.ts`

### Example 4: Rubric grader prompt

**File**: `packages/core/src/services/graders/rubric-prompt.ts`

Used at `rubric-agent.ts`.

### Example 5: Approach-feedback prompt

**File**: `packages/core/src/services/graders/approach-prompt.ts`

Used at `approach-feedback.ts`.

## When to Use

- A system prompt exceeds ~10 lines or contains few-shot examples.
- The prompt is a tunable knob you expect to revise without changing the surrounding code.
- The agent file is otherwise focused on plumbing (engine call, parsing, error handling).

## When NOT to Use

- A prompt is a 1-line label or a small composed string built from runtime values — keep it inline.
- The prompt is mode-aware and built from `PromptFragment` objects — use the `mode-prompt-fragment-composition` path instead.

## Common Violations

- Inlining a 30-line prompt in the agent file — clutters the inference logic and makes diff review noisy.
- Storing the prompt in JSON / DB — prompts are code, not config; ship them in TS so changes go through review.
- Mixing the prompt and the few-shot examples across multiple consts in the sidecar — keep one exported `<NAME>_SYSTEM_PROMPT`.
