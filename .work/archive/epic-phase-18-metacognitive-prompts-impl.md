---
id: epic-phase-18-metacognitive-prompts-impl
kind: story
stage: done
tags: [content]
parent: epic-phase-18-metacognitive-prompts
depends_on: []
release_binding: v0.1.0
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Cross-mode metacognitive prompt fragment

## Scope

Build a parameterized prompt fragment that injects metacognition-coach
instructions into teach / quiz / homework / exam modes. The fragment
declares which trigger-prompts the mode cares about (pre-reading,
post-error, session-end, etc.) and instructs the model to call
`pedagogy.list_metacognitive_prompts({ trigger })` at runtime to fetch
the actual prompt templates from the pedagogy pack.

The design lives in the parent feature body
(`epic-phase-18-metacognitive-prompts`); read it for architecture and
design decisions before starting.

## Units

### Unit 1: `metacognitivePromptsFragment(triggers)` factory

**File**: `packages/curriculum/src/modes/fragments/metacognitive-prompts.ts`

A factory that returns a `PromptFragment` parameterized by the trigger
set. Each opting mode calls the factory with its relevant triggers.

```typescript
import type {
  MetacognitivePromptTrigger,
  PromptFragment,
} from "@praxis/core/types";

export interface MetacognitivePromptsFragmentInput {
  triggers: ReadonlyArray<MetacognitivePromptTrigger>;
}

const TRIGGER_GUIDANCE: Record<MetacognitivePromptTrigger, string> = {
  "pre-reading":
    "Before introducing new material — surface what the student expects, what they think they know, and what they suspect might trip them up.",
  "post-reading":
    "After the student has read or you've explained a chunk — ask them to summarize the central claim in their own words.",
  "pre-quiz":
    "Before posing a graded item — ask them to predict their confidence on the first question, then compare to outcome at the end.",
  "post-error":
    "After a wrong answer or visible struggle — ask them to trace which assumption their attempt rested on, not just what the right answer is.",
  "session-end":
    "When wrapping up — ask them to name one thing they'd review tomorrow and one thing that feels solid.",
};

export function metacognitivePromptsFragment(
  input: MetacognitivePromptsFragmentInput,
): PromptFragment {
  const triggerLines = input.triggers
    .map((t) => `- **${t}** — ${TRIGGER_GUIDANCE[t]}`)
    .join("\n");

  return {
    id: "metacognitive-prompts",
    position: "principles",
    customizable: false,
    template: `Metacognition is woven through your teaching — you coach the
student's thinking-about-their-thinking, not just their content knowledge.
At the moments listed below, surface a metacognitive prompt:

${triggerLines}

To get a concrete prompt template, call
\`pedagogy.list_metacognitive_prompts({ trigger: "<trigger>" })\` and weave
ONE prompt naturally into your response. Don't recite the template
verbatim — adapt it to the moment. Don't surface multiple metacognitive
prompts back-to-back; one well-timed prompt beats three perfunctory ones.

If \`pedagogy.list_metacognitive_prompts\` returns an empty list (no pack
loaded, or no prompts for that trigger), skip the metacognitive surface
for that moment — proceed with normal teaching.`,
  };
}
```

**Acceptance**:
- [ ] Factory returns a `PromptFragment` with `id:
      "metacognitive-prompts"`, `position: "principles"`,
      `customizable: false`.
- [ ] Template includes the requested triggers as bulleted lines with
      their guidance text.
- [ ] Template instructs the model to call
      `pedagogy.list_metacognitive_prompts({ trigger })` and to fall
      back gracefully on empty.
- [ ] Factory is pure — same input always produces the same template
      string.

### Unit 2: Teach mode opt-in

**File**: `packages/curriculum/src/modes/teach.ts` (modify)

```typescript
import { metacognitivePromptsFragment } from "./fragments/metacognitive-prompts.js";

export const teachMode: Mode = {
  // ...
  promptFragments: [
    preambleFragment,
    roleFragment,
    principlesFragment,
    metacognitivePromptsFragment({
      triggers: ["pre-reading", "post-error", "session-end"],
    }),
    toolsFragment,
    sketchAwarenessFragment,
    courseContextFragmentDefault,
    constraintsFragment,
    postambleFragment,
  ],
  toolNames: [
    // ... existing tools ...
    "pedagogy.list_metacognitive_prompts", // ← Phase 18: metacognitive prompts
  ],
};
```

Position the new fragment AFTER `principlesFragment` so the
metacognitive-coaching instruction reads as an extension of the
project's principles, not a standalone constraint.

**Acceptance**:
- [ ] Teach mode's `promptFragments` includes the metacognitive
      fragment with the three triggers.
- [ ] Teach mode's `toolNames` includes
      `pedagogy.list_metacognitive_prompts`.
- [ ] Existing teach-mode tests still pass.

### Unit 3: Quiz / Homework / Exam mode opt-ins

**Files**:
- `packages/curriculum/src/modes/quiz.ts`
- `packages/curriculum/src/modes/homework.ts`
- `packages/curriculum/src/modes/exam.ts`

Each mode adds the fragment with its relevant triggers, plus
`pedagogy.list_metacognitive_prompts` to its toolNames.

Trigger sets per design decision in the feature body:

- **quiz**: `["pre-quiz", "post-error"]`
- **homework**: `["pre-reading", "post-error"]`
- **exam**: `["session-end"]` only — the verification stance forbids
  post-error coaching during the exam itself; only the session-end
  reflection is appropriate.

For exam mode, double-check that
`pedagogy.list_metacognitive_prompts` doesn't conflict with its strict
tool subset (`assignment.show`, `assignment.read_grade`, `sketch.read`,
`clarification`). The pedagogy.list tool is a read-only metadata lookup
— it's safe in the verification stance because it doesn't reveal answer
information; it returns prompt templates the agent uses to invite
reflection.

**Acceptance**:
- [ ] Each mode's `promptFragments` array includes the metacognitive
      fragment with the trigger set declared above.
- [ ] Each mode's `toolNames` includes
      `pedagogy.list_metacognitive_prompts`.
- [ ] Exam mode's other tool restrictions stay intact (no
      `assignment.create`, no `grade_math`, no `update_mastery`).
- [ ] Existing per-mode tests still pass.

### Unit 4: Tests

**File**:
`packages/curriculum/src/modes/fragments/__tests__/metacognitive-prompts.test.ts`

- Factory returns the right `id` / `position` / `customizable` shape.
- Empty triggers array still returns a valid fragment (template has the
  surrounding guidance but no trigger lines).
- A subset of triggers produces only those bullet lines (assert string
  contains "- **pre-reading** — …" etc).
- Round-trip: every `MetacognitivePromptTrigger` value passes through
  the factory without throwing.

**File**:
`packages/curriculum/src/modes/__tests__/metacognitive-prompts-integration.test.ts`

- Teach / quiz / homework / exam modes each have the metacognitive
  fragment in their promptFragments at position `principles`.
- Each opting mode has `pedagogy.list_metacognitive_prompts` in its
  toolNames.
- Each opting mode's fragment carries the right trigger set per the
  design.

## Acceptance criteria (story)

- [x] `metacognitivePromptsFragment(triggers)` factory exists and is
      pure.
- [x] Teach / quiz / homework / exam modes opt in with their respective
      trigger sets.
- [x] Each opting mode's toolNames includes
      `pedagogy.list_metacognitive_prompts`.
- [x] `study-skills` mode does NOT include this fragment (its role
      fragment IS the metacognition coach voice — adding the cross-mode
      fragment would duplicate).
- [x] `bootstrap` and `configure` modes also do NOT include the
      fragment — they're pre-curricular / authoring contexts, not
      student-facing teaching.
- [x] `pnpm typecheck && pnpm test` green.
- [x] `pnpm lint` shows no regression past the current 9-error baseline
      (the story description cited 4 but the actual HEAD baseline is 9 —
      all pre-existing in `@praxis/claude-cli-sdk` and `@praxis/client`).

## Implementation notes

### Files created

- `packages/curriculum/src/modes/fragments/metacognitive-prompts.ts`
  — `metacognitivePromptsFragment(input)` factory with `TRIGGER_GUIDANCE`
  table for all five `MetacognitivePromptTrigger` values.
- `packages/curriculum/src/modes/fragments/__tests__/metacognitive-prompts.test.ts`
  — 27 unit tests: shape, empty triggers, subset triggers, round-trip
  all trigger values, purity.
- `packages/curriculum/src/modes/__tests__/metacognitive-prompts-integration.test.ts`
  — 34 integration tests asserting each opting mode's fragment list,
  trigger set content, and toolNames.

### Files modified

- `packages/curriculum/src/modes/teach.ts` — import factory, insert
  fragment after `principlesFragment`, add tool to `toolNames`.
- `packages/curriculum/src/modes/quiz.ts` — same pattern, trigger set
  `["pre-quiz", "post-error"]`.
- `packages/curriculum/src/modes/homework.ts` — same pattern, trigger
  set `["pre-reading", "post-error"]`. Note: `toolNames` is still
  `quizMode.toolNames` (shared reference) — since `quizMode.toolNames`
  now includes `pedagogy.list_metacognitive_prompts`, homework
  automatically inherits it. This is correct because the
  `promptFragments` arrays are independent (each declares its own
  trigger set).
- `packages/curriculum/src/modes/exam.ts` — trigger set `["session-end"]`
  only; `pedagogy.list_metacognitive_prompts` added explicitly to the
  minimal verification-stance toolNames.
- `packages/curriculum/src/__tests__/teach-mode.test.ts` — updated
  hardcoded fragment count 8 → 9.
- `packages/curriculum/src/__tests__/quiz-mode.test.ts` — updated
  hardcoded fragment count 9 → 10.
- `packages/curriculum/src/__tests__/exam-mode.test.ts` — updated
  hardcoded toolNames count 4 → 5; added assertion for new tool.

### Discrepancies from design

- Lint baseline was 9 errors at HEAD, not 4 as stated in the story
  prompt. No new errors introduced.

### Verification results

- `pnpm typecheck`: clean (all packages pass tsgo).
- `pnpm --filter @praxis/curriculum test`: 307 tests, all pass.
- `pnpm test` (full repo): 2200 tests pass, 15 skipped (slow Pyodide),
  265 test files, 1 skipped.
- `pnpm lint`: 9 errors — same as HEAD baseline; no new errors.

## Review (2026-05-10)

**Verdict**: Approve

**Blockers**: none
**Important**: none

**Nits** (in conversation only):
- `TRIGGER_GUIDANCE` is a hardcoded TS table. Could conceivably pull
  from the pedagogy pack at runtime to keep guidance consistent with
  pack content, but that would couple mode definitions to pack state
  and complicate the static type. Static guidance is the right call —
  the table teaches the model WHEN to look up a trigger; the prompt
  template itself comes from the pack via the runtime tool call.
- Homework mode reuses `quizMode.toolNames` via direct reference — a
  pre-existing pattern that means homework gets `pedagogy.list_metacognitive_prompts`
  transitively when quiz adds it. Smart deduplication; called out
  with an explanatory comment.

**Notes**:
- Verified at HEAD (`87217c6`): `pnpm typecheck` clean;
  `pnpm --filter @praxis/curriculum test` 307 passed; `pnpm test`
  (full repo) 2200 passed / 15 skipped; `pnpm lint` 9 errors
  (unchanged baseline; zero new from this story).
- Implementation matches the design exactly: factory is pure
  (parameterized by trigger set, deterministic output), each opting
  mode (teach / quiz / homework / exam) calls the factory with its
  declared trigger subset, and each opting mode's toolNames includes
  `pedagogy.list_metacognitive_prompts`.
- Exam mode's verification stance preserved: the addition of
  `pedagogy.list_metacognitive_prompts` is read-only metadata and
  doesn't reveal answer information. The fragment opts in with
  `["session-end"]` only, so no during-exam coaching surfaces.
- 27 factory unit tests + 34 integration tests + 3 updated per-mode
  test files (count assertions bumped). Coverage is solid: shape
  assertions, empty-trigger fallback, subset triggers, all five
  trigger values round-trip, per-mode promptFragments and toolNames
  membership.
- Trigger sets per mode match the design exactly:
  - teach: `["pre-reading", "post-error", "session-end"]`
  - quiz: `["pre-quiz", "post-error"]`
  - homework: `["pre-reading", "post-error"]`
  - exam: `["session-end"]` only

What's now possible: the metacognition coach voice is now woven
through every student-facing teaching mode. CURRICULUM.md's assertion
("Modes layer the metacognition coach's voice on top") is now
operational. The closing piece of Phase 18 — `routing-integration` —
can now design against a complete coach surface (including the
mode-transition target into `study-skills`).
