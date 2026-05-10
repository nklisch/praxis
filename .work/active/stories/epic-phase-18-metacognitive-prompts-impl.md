---
id: epic-phase-18-metacognitive-prompts-impl
kind: story
stage: implementing
tags: [content]
parent: epic-phase-18-metacognitive-prompts
depends_on: []
release_binding: null
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

- [ ] `metacognitivePromptsFragment(triggers)` factory exists and is
      pure.
- [ ] Teach / quiz / homework / exam modes opt in with their respective
      trigger sets.
- [ ] Each opting mode's toolNames includes
      `pedagogy.list_metacognitive_prompts`.
- [ ] `study-skills` mode does NOT include this fragment (its role
      fragment IS the metacognition coach voice — adding the cross-mode
      fragment would duplicate).
- [ ] `bootstrap` and `configure` modes also do NOT include the
      fragment — they're pre-curricular / authoring contexts, not
      student-facing teaching.
- [ ] `pnpm typecheck && pnpm test` green.
- [ ] `pnpm lint` shows no regression past the current 4-error baseline.
