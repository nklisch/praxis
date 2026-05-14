---
id: epic-course-structured-tutor-course-aware-mode-prompts-story-1-foundation
kind: story
stage: review
tags: [tutor-ux, mode-prompts, curriculum]
parent: epic-course-structured-tutor-course-aware-mode-prompts
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# Foundation — extend facts fragment + add per-mode behavior composer + wire SessionServiceImpl

## Scope

Foundation unit for the course-aware mode prompts feature. Five mode
addendum stories depend on this. Does NOT write the per-mode prose —
just the plumbing the addenda hang off of.

## Units implemented

### Unit 1: Extend `composeCourseContextFragment` with documents

**File**: `packages/curriculum/src/brief/course-context.ts`

Add optional third parameter:

```typescript
export function composeCourseContextFragment(
  snapshot: CourseStateSnapshot,
  masteryByConceptId?: ReadonlyMap<string, number>,
  documents?: ReadonlyArray<DocumentScopeAttachment>,
): PromptFragment;
```

Render an "Available documents (course-scope, retrievable via
`retrieve_from_documents`)" section listing up to 12 filenames as
`  • <filename> (<chunkCount> chunks)`; tail with "…and N more
documents" beyond 12. Undefined or empty → render nothing
(byte-equivalent to current behavior).

### Unit 2: New composer + fallback fragments

**Files**:
- `packages/curriculum/src/brief/in-course-behavior.ts` (new)
- `packages/curriculum/src/modes/fragments/in-course-behavior.ts` (new)

Export:
- Type `InCourseBehaviorModeId = "teach" | "quiz" | "homework" | "exam" | "study-skills"`
- `behaviorInCourseFragmentId(modeId)` returning
  `"context.behavior-in-course.<mode>"`
- `composeInCourseBehaviorFragment(modeId, snapshot)` returning a
  `PromptFragment` at `position: "context"`, `customizable: true`.
  This story stubs each mode branch with a placeholder
  one-line template that names the current lesson title; the
  five addendum stories replace each branch with the
  actual prose.
- `behaviorInCourseFragmentDefault.<mode>` — a record of five
  fallback fragments (one per mode) with the no-course
  template "No active course — operate generically and rely on
  the student's stated topic."

Add public exports through `@praxis/curriculum`'s `index.ts`.

### Unit 3: Wire SessionServiceImpl

**File**: `packages/core/src/services/session-service.ts`

Inside the existing `if (args.courseId && this.deps.toolServices.courseState)` block:

1. Fetch `courseDocuments` via
   `documentScopes.listForScopeDetailed({kind:"course", id})`
   ONCE; reuse for both `composeCourseContextFragment` and the
   downstream `courseDocumentIds` computation.
2. Pass `courseDocuments` to `composeCourseContextFragment`.
3. After the existing `overrides = new Map([[fragment.id, fragment.template]])`,
   if `args.mode.id ∈ {teach, quiz, homework, exam, study-skills}`,
   compute `composeInCourseBehaviorFragment(args.mode.id, snapshot)`
   and set its template into the overrides map.

Add a comment block near the override site explaining the
override-by-default convention.

## Acceptance criteria

- [ ] `composeCourseContextFragment(snapshot, undefined, undefined)` is
  byte-equivalent to the previous signature.
- [ ] `composeCourseContextFragment(snapshot, undefined, [...12 docs])`
  renders all 12; with 13 documents renders 12 + "…and 1 more".
- [ ] `composeInCourseBehaviorFragment("teach", snapshot).id` ===
  `"context.behavior-in-course.teach"`.
- [ ] `behaviorInCourseFragmentDefault.<mode>` exists for all five
  modes; each has `customizable: true` and a non-empty default
  template.
- [ ] SessionServiceImpl: a teach session with `courseId` set
  produces a prompt containing both `composeCourseContextFragment`'s
  rendered text AND the addendum from
  `composeInCourseBehaviorFragment`. With `courseId` null, only the
  two fallback templates appear.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green in
  `@praxis/curriculum` and `@praxis/core`.
- [ ] No new `additionalFragments` injection added; everything stays
  on the overrides path.

## Tests written

- `packages/curriculum/src/brief/__tests__/course-context.test.ts` —
  extended with `documents` cases.
- `packages/curriculum/src/brief/__tests__/in-course-behavior.test.ts`
  (new) — composer returns the right id and customizable flag for
  each mode; fallback fragments are well-formed.
- `packages/core/src/services/__tests__/session-service.in-course-overrides.test.ts`
  (new) — integration test using `useTempDb` + fixture course;
  asserts the override path replaces both `context.course-state`
  and `context.behavior-in-course.<mode>`.

## Out of scope (deferred to addendum stories)

- The actual per-mode prose inside `composeInCourseBehaviorFragment`.
  This story uses placeholder one-line templates; each addendum
  story replaces one mode's branch with the real prose.
