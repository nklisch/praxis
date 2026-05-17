---
id: gate-docs-mode-prompt-fragment-in-course-behavior
kind: story
stage: done
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: docs
created: 2026-05-14
updated: 2026-05-14
---

# `mode-prompt-fragment-composition` pattern's `teachMode` example is missing `behaviorInCourseFragmentDefault.teach` and the pattern body doesn't acknowledge course-aware fragments

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/mode-prompt-fragment-composition.md:25-39`
- Code:
  - `packages/curriculum/src/modes/teach.ts:20-33`
  - `packages/curriculum/src/brief/in-course-behavior.ts:31`
  - `packages/curriculum/src/brief/course-context.ts:47`
  - `packages/core/src/services/session-service.ts:637,658`

## Current doc text
```typescript
export const teachMode: Mode = {
  id: "teach",
  promptFragments: [
    preambleFragment,
    roleFragment,
    principlesFragment,
    metacognitivePromptsFragment({ triggers: [...] }),
    toolsFragment,
    sketchAwarenessFragment,
    courseContextFragmentDefault,
    constraintsFragment,
    postambleFragment,
  ],
};
```

## Reality
`teachMode.promptFragments` also includes
`behaviorInCourseFragmentDefault.teach` between
`courseContextFragmentDefault` and `constraintsFragment`
(`packages/curriculum/src/modes/teach.ts:30`). Five modes (teach,
quiz, homework, exam, study-skills) now carry an
`in-course-behavior` defaults fragment that is replaced at session
start via `composeInCourseBehaviorFragment(modeId, courseCtx)` and
passed in through `additionalFragments`. The pattern body doesn't
mention this — the new "course-aware behavior addendum" is structurally
identical to `course-context` (default placeholder in
`promptFragments`, runtime composition via an `additionalFragments`
override) and is worth naming as a sibling to keep the pattern complete.

## Required edit
Add `behaviorInCourseFragmentDefault.teach,` to the teach-mode
`promptFragments` example. In the prose, add a short sentence after the
`course-context` mention noting that the same defaults-plus-runtime-override
shape now also produces the `in-course-behavior` fragment in five modes
via `composeInCourseBehaviorFragment`. No structural change to the
pattern itself — both are vanilla `additionalFragments` use cases.

## Implementation

Two edits to `.claude/skills/patterns/mode-prompt-fragment-composition.md`:

1. **Example addition**: Added `behaviorInCourseFragmentDefault.teach,` to the `teachMode.promptFragments` array in Example 2, between `courseContextFragmentDefault` and `constraintsFragment`, matching the actual code at `packages/curriculum/src/modes/teach.ts:30`.

2. **Prose addition**: Extended the "Per-session computed content" bullet in the "When to Use" section to note that the same defaults-plus-runtime-override shape produces the `in-course-behavior` fragment in teach/quiz/homework/exam/study-skills modes via `composeInCourseBehaviorFragment(modeId, courseCtx)`, with the override delivered through the `overrides` map at session open time (not `additionalFragments` — the code at `session-service.ts:662` uses `overrides.set(behavior.id, behavior.template)`).

## Review

Approved. All cross-checks pass.

**Example addition** (`teach.ts:30`): `behaviorInCourseFragmentDefault.teach` is confirmed present between `courseContextFragmentDefault` and `constraintsFragment` in the live source. The pattern doc Example 2 now matches exactly.

**Prose correction** (`session-service.ts:662`): The implementer correctly caught that the story's claim ("passed in through `additionalFragments`") was wrong. The runtime path is `overrides.set(behavior.id, behavior.template)` — the override goes into the `overrides` map, not `additionalFragments`. The updated prose in the "Per-session computed content" bullet states this accurately and distinguishes the two mechanisms. This is the right call: `additionalFragments` adds new fragments; `overrides` replaces a placeholder fragment's template in-place. They are separate code paths and the distinction matters for anyone extending the pattern.

**Scope and completeness**: Both required edits from the story are present and accurate. No regressions introduced — the change is purely additive doc text. The implementer's escape-hatch note (correcting the story's own incorrect claim) is appropriate and improves the pattern's correctness.
