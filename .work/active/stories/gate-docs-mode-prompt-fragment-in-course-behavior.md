---
id: gate-docs-mode-prompt-fragment-in-course-behavior
kind: story
stage: implementing
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
