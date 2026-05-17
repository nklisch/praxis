---
id: course-aware-mode-prompts-missing-tests
kind: story
stage: done
tags: [testing, curriculum]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# Add missing tests for course-aware mode prompts foundation

## Scope

The foundation story (`epic-course-structured-tutor-course-aware-mode-prompts-story-1-foundation`) shipped without three test files that its acceptance criteria explicitly required. Existing mode-shape tests verify the fragment is registered, but the new code paths in `composeCourseContextFragment` (documents listing) and `composeInCourseBehaviorFragment` (per-mode dispatch) lack direct unit tests, and the SessionServiceImpl override path has no integration assertion.

Findings from review (2026-05-14) of foundation story.

## Tests to add

1. **`packages/curriculum/src/brief/__tests__/in-course-behavior.test.ts`** (new):
   - `behaviorInCourseFragmentId("teach")` returns `"context.behavior-in-course.teach"`.
   - `composeInCourseBehaviorFragment(modeId, snapshot)` returns a fragment with `position: "context"`, `customizable: true` for each of teach/quiz/homework/exam/study-skills.
   - Each branch's template mentions the lesson title from the snapshot.
   - `behaviorInCourseFragmentDefault.<mode>` is well-formed for all five modes.

2. **`packages/curriculum/src/brief/__tests__/course-context.test.ts`** (extend):
   - `composeCourseContextFragment(snapshot, undefined, undefined)` is byte-equivalent to the previous signature.
   - With 12 documents, renders all 12.
   - With 13 documents, renders 12 + "…and 1 more".
   - Empty array renders nothing.

3. **`packages/core/src/services/__tests__/session-service.in-course-overrides.test.ts`** (new):
   - Integration test with `useTempDb` and a fixture course.
   - A teach session with `courseId` set produces a system prompt containing BOTH the `composeCourseContextFragment` text AND the `composeInCourseBehaviorFragment` addendum text.
   - A teach session with `courseId === null` produces only the fallback templates.
   - Verify for at least one other mode (e.g. quiz).

## Acceptance criteria

- [x] Three test files exist and pass.
- [x] `pnpm typecheck && pnpm lint && pnpm test` green.

## Notes

- Tests are pure-logic where possible; only the SessionServiceImpl one needs a temp DB.

## Implementation notes (2026-05-14)

**Files landed**:

1. `packages/curriculum/src/brief/__tests__/in-course-behavior.test.ts` (new) — 21 cases:
   - `behaviorInCourseFragmentId` returns the canonical id for each of teach/quiz/homework/exam/study-skills.
   - `composeInCourseBehaviorFragment` returns a well-formed fragment (`id`, `position: "context"`, `customizable: true`, non-empty template) for each mode.
   - Each branch's template mentions the current lesson + course titles. **Caveat**: the exam branch's text doesn't quote the lesson title (its prose says "stay strictly within the assignment-bound items for this course's exam" — closed surface, implicit lesson), so the assertion for exam is the weaker "contains 'course'" rather than the lesson-title match used for the other four. This matches the spec — the addendum stories shaped exam this way intentionally.
   - Null `currentLesson` → composer interpolates the "(no current lesson)" fallback. Asserted on the teach branch.
   - `behaviorInCourseFragmentDefault.<mode>` set is well-formed and explicitly references "no active course" for all five modes (so a stale override doesn't accidentally read like a course-active one).

2. `packages/curriculum/src/brief/__tests__/course-context.test.ts` (extended) — added a "documents parameter" describe block with 5 cases:
   - Byte-equivalent to previous signature when `documents` is undefined.
   - Empty array renders nothing.
   - 12 documents render all 12 inline (no tail).
   - 13 documents render 12 + "…and 1 more documents" tail.
   - Per-document chunk count is included in the listing.

3. `packages/core/src/services/__tests__/session-service.in-course-overrides.test.ts` (new) — 3 integration cases via `useTempDb`:
   - Teach session with `courseId` set + a mocked `courseState.read` produces a system prompt containing BOTH "Algebra Adventures" / "Current lesson:" / "Variables and Constants" (course-context block) AND "Course-aware behavior (teach)" (in-course addendum). Neither fallback sentinel appears.
   - Teach session without `courseId` (no `courseState` registered) — prompt contains only the two fallback sentinels; the dynamic content does NOT appear.
   - Quiz mode exercise — quiz-specific addendum injects ("Course-aware behavior (quiz)"); teach-specific text does not appear. Verifies the dispatcher correctly picks the active mode.

The integration test mirrors the fake-engine pattern from `session-service.prompt-customization.test.ts`, capturing `engine.open(opts).systemPrompt` and asserting on the rendered string.

Verification: `pnpm vitest run packages/curriculum/src/brief/__tests__/in-course-behavior.test.ts packages/curriculum/src/brief/__tests__/course-context.test.ts packages/core/src/services/__tests__/session-service.in-course-overrides.test.ts` → 42 tests pass (21 + 18 + 3). Full `pnpm test` green (3293 pass).

## Review (2026-05-14)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: exam branch uses a weaker substring assertion (`"course"`) than the other four modes — explicitly justified in implementation notes (exam template intentionally uses closed-surface formulation that doesn't quote lesson title).

**Notes**:
- All three test files exist and pass; all acceptance criteria met.
- `in-course-behavior.test.ts`: 21 cases via `it.each(MODES)` covering canonical-id, well-formed-fragment, mode-template-content, null-current-lesson fallback, and fallback-fragment-set well-formedness. Clean and tabular.
- `course-context.test.ts`: +5 cases in a "documents parameter" describe block covering undefined byte-equivalence, empty array, 12-doc cap, 13-doc tail, and per-doc chunk-count. Pre-existing 13 cases preserved.
- `session-service.in-course-overrides.test.ts`: 3 integration cases via `useTempDb` + fake engine that captures `engine.open(opts).systemPrompt`. Asserts on sentinel-replacement (FALLBACK_* sentinels absent when dynamic blocks run, present when courseId absent) — a cleaner contract than literal-string equality. Mirrors the established `session-service.prompt-customization.test.ts` pattern.
- Tests verify behavioral contract (what the composer produces), not implementation details. Good edge-case coverage at the cap boundary.
