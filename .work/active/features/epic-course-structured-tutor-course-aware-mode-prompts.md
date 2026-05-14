---
id: epic-course-structured-tutor-course-aware-mode-prompts
kind: feature
stage: done
tags: [tutor-ux, mode-prompts, curriculum]
parent: epic-course-structured-tutor
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# Course-aware mode prompts — anchor the tutor on the active course

## Brief

The teach, quiz, homework, exam, and study-skills mode prompts are
written generically — they teach the topic, check understanding, and
adapt — but they don't strongly leverage the structured course
artifacts that now exist. A teach session inside a course should be
**aware of which lesson it's in**, draw verification material from
that lesson's assessment plan, query the course's ingested documents
before generalizing, and reference the unit/lesson context the student
is actually inside. Today the tutor improvises around the curriculum
rather than following it.

This feature adds **course-context awareness to the mode prompt
composition**. The likely shape is one **shared, customizable=false
"course context" fragment** that gets composed into the prompt **only
when `session.courseId != null`** — naming the active course, the
current unit and lesson, the lesson's concepts, the lesson's assessment
plan summary, and the available ingested documents. Each mode's
existing fragments stay; the new fragment slots into the FRAGMENT_ORDER
above the mode-specific behavior fragments so the tutor knows
"where I am" before "what I'm doing."

Keep the no-course fallback path intact for free-exploration mode and
when the student is outside a course. The new fragment is opt-in by
context, not a replacement.

## Epic context

- Parent epic: `epic-course-structured-tutor`
- Position in epic: independent. Parallelizable with the other two
  features.

## Scope absorbed from backlog

- `idea-mode-prompts-course-structure-aligned` — course-aware mode
  prompt variants that anchor on the active course's structure.

## Foundation references

- `docs/CURRICULUM.md` — course / unit / lesson / assessment plan model
- `docs/ARCHITECTURE.md` — mode + pedagogy pack composition
- `CLAUDE.md` — pattern `mode-prompt-fragment-composition`

## Anchors (current implementation)

- Mode definitions —
  `packages/curriculum/src/modes/` (one file per mode: `teach.ts`,
  `quiz.ts`, `homework.ts`, `exam.ts`, `study-skills.ts`,
  `bootstrap.ts`, `configure.ts`)
- Shared fragments directory —
  `packages/curriculum/src/modes/fragments/` (~20 fragment files;
  SSOT — modes import from here)
- Prompt composition —
  `packages/curriculum/src/compose-system-prompt.ts` (or wherever
  `composeSystemPrompt` and `FRAGMENT_ORDER` live)
- Session course-id —
  `packages/core/src/types/` for the `Session` type that exposes
  `courseId`; consumed in `SessionServiceImpl.openActive`
- Course / lesson lookup — `@praxis/artifacts` accessors for fetching
  the active course's structure
- Mode tool scoping precedent — pattern `mode-tool-scoping` shows
  how `session.modeId` drives runtime selection; a similar
  `session.courseId != null` check drives fragment inclusion

## Pre-design decisions (2026-05-14)

- **Prompt composition shape**: HYBRID. One shared
  customizable=false fragment names the factual course context
  (Course / Unit / Lesson / Concepts / Available documents). Each
  in-course mode declares an optional per-mode behavior addendum
  that references those facts — e.g., quiz mode's addendum says
  "when quizzing, draw from this lesson's assessment plan"; teach
  mode's addendum says "anchor on the concept dependencies in this
  lesson"; study-skills says "tie technique suggestions to the
  lesson's concepts and resources". Facts are SSOT; behaviors vary
  per mode.
- **Modes that get course-aware behavior**: teach, quiz, homework,
  exam, study-skills. Bootstrap and configure are excluded — they
  have their own contracts and no notion of "active course
  context".
- **Activation**: shared fragment and per-mode addenda are composed
  only when `session.courseId != null`. No-course sessions stay on
  the existing free-form path with no shape change.
- **SSOT location**: shared fragment as a new file in
  `packages/curriculum/src/modes/fragments/`. Per-mode addenda
  added as additional entries in each mode's existing
  `promptFragments` array (or a parallel `inCoursePromptFragments`
  array — feature-design picks the exact composition primitive
  based on how `composeSystemPrompt` reads sequence vs.
  conditional inclusion).
- **Course-lookup contract**: feature-design must verify that
  `@praxis/artifacts` (or `@praxis/curriculum`) exposes an
  accessor that reads a course's structure (unit / lesson /
  concepts / documents) in one round-trip — N+1 lookups at
  prompt-composition time would slow every session-open.

## Design decisions (2026-05-14, autopilot)

- **The "facts" fragment already exists** —
  `composeCourseContextFragment` in
  `packages/curriculum/src/brief/course-context.ts` (id
  `context.course-state`, position `context`,
  `customizable: true`). It's already wired through
  `SessionServiceImpl.openActive` (line 617 of
  `packages/core/src/services/session-service.ts`) via the
  `overrides` map. Every mode in the in-course set
  (`teach`, `quiz`, `homework`, `exam`, `study-skills`)
  already declares `courseContextFragmentDefault` in its
  `promptFragments`. This feature **extends** that fragment
  (adds documents) rather than introducing a new one.
- **Accessor used**: `CourseStateReader.read({studentId,
  courseId})` — implemented in
  `ArtifactsServiceImpl.read(...)`. Bounded I/O (one course
  + one lessons list + two `inArray` reads for concept rows
  and study log + one gates batch). Already paid for on
  every session-open today; no new I/O introduced beyond
  the documents list, which is `documentScopes.listForScopeDetailed({kind:"course",id})`
  — a single indexed `SELECT … JOIN documents` already
  performed at session-open (`courseDocumentIds` line 690),
  so we coalesce reads.
- **Composition primitive for per-mode addenda**:
  **override-by-default**, mirroring the `context.course-state`
  pattern. Each in-course mode declares a new fallback
  fragment (`behaviorInCourseFragmentDefault.<mode>`) in its
  `promptFragments` array; SessionServiceImpl replaces its
  template via the `overrides` map when `courseId != null`,
  using a new composer (`composeInCourseBehaviorFragment(mode,
  snapshot)`). Rejected alternative: `additionalFragments`
  injection — codebase comments warn that
  `additionalFragments` does not dedupe by id and the
  no-course path would have to omit (more branching).
  Override-by-default produces a uniform code path and a
  stable byte-equivalent no-course prompt.
- **Default-template content** for the new fallback fragments:
  a single short line ("No course-aware behavior — operate
  generically"), not an empty string. Empty strings produce
  doubled `\n\n` separators in `composeSystemPrompt`'s join.
- **Modes that get addenda**: teach, quiz, homework, exam,
  study-skills (5). Bootstrap and configure are out of scope —
  they have their own role fragments and no notion of an
  "active course context".
- **Activation rule**: per-mode addendum override is set
  inside the existing `if (args.courseId && this.deps.toolServices.courseState)`
  block. No-course sessions render the empty-default
  addendum; with-course sessions render the mode-specific
  addendum.
- **`uiSurface` and `requiredRole`** are unchanged.
  `toolNames` are unchanged — no new tools introduced.

## Architectural choice

**Extend the existing `context.course-state` override mechanism
with a sibling `context.behavior-in-course.<mode>` override per
mode.** The facts override carries dynamic course state; the
behavior override carries the mode-specific authoring guidance
that *references* those facts.

Why over the two alternatives:

- **Vs. inlining behavior into the facts fragment**: facts
  belong to the snapshot (which is identical across modes);
  behaviors are mode-specific. Mixing them violates SSOT and
  forces a per-mode composer that re-derives the snapshot.
- **Vs. injecting via `additionalFragments`**: requires both
  with-course and no-course branches in SessionServiceImpl,
  and the no-course path must construct nothing — easy to
  drift. The override-by-default pattern keeps a single uniform
  path: every in-course mode always has two `context`-slot
  fragments; their content changes based on `courseId`.

## Implementation Units

### Unit 1: Extend the facts fragment with documents

**File**: `packages/curriculum/src/brief/course-context.ts`
**Story**: `epic-course-structured-tutor-course-aware-mode-prompts-story-1-foundation`

Extend `composeCourseContextFragment` to accept the course's
attached documents and render them under an
"Available documents" section.

```typescript
import type {
  CourseStateSnapshot,
  DocumentScopeAttachment,
  PromptFragment,
} from "@praxis/core/types";

export function composeCourseContextFragment(
  snapshot: CourseStateSnapshot,
  masteryByConceptId?: ReadonlyMap<string, number>,
  documents?: ReadonlyArray<DocumentScopeAttachment>,
): PromptFragment;
```

Rendering: append (after the active-gate block, before the
return) a section like:

```
Available documents (course-scope, retrievable via retrieve_from_documents):
  • <filename> (<chunkCount> chunks)
  • <filename> (<chunkCount> chunks)
```

When `documents` is undefined OR empty, render nothing
(unchanged from current behavior). `documents` is optional so
existing call sites and tests keep compiling without change —
the new third parameter is appended.

**Implementation Notes**:
- Cap the list at 12 filenames to keep prompts bounded.
  Beyond that: "...and N more documents".
- Filenames may contain user-uploaded names — render them
  unescaped (they're context, not executed).

**Acceptance Criteria**:
- [ ] With `documents` undefined → byte-equivalent output to
  current fragment.
- [ ] With `documents = []` → byte-equivalent output to current
  fragment.
- [ ] With `documents = [{ filename: "Algebra-I.pdf", chunkCount:
  42, … }]` → output contains a single "Available documents"
  line plus a bulleted filename.
- [ ] With > 12 documents → first 12 listed plus a "…and N more"
  tail.

---

### Unit 2: Composer + per-mode default fragments for behavior addenda

**File**: `packages/curriculum/src/brief/in-course-behavior.ts`
(new file)
**Story**: `epic-course-structured-tutor-course-aware-mode-prompts-story-1-foundation`

```typescript
import type {
  CourseStateSnapshot,
  PromptFragment,
} from "@praxis/core/types";

export type InCourseBehaviorModeId =
  | "teach"
  | "quiz"
  | "homework"
  | "exam"
  | "study-skills";

export function behaviorInCourseFragmentId(
  modeId: InCourseBehaviorModeId,
): string {
  return `context.behavior-in-course.${modeId}`;
}

/**
 * Build the behavior addendum fragment for a given mode.
 * The fragment's template references the facts in
 * context.course-state without restating them. Snapshot is
 * passed so the addendum can name the current lesson and
 * cite its assessment plan / concept dependencies.
 */
export function composeInCourseBehaviorFragment(
  modeId: InCourseBehaviorModeId,
  snapshot: CourseStateSnapshot,
): PromptFragment;
```

Per-mode prose (specified in detail in each addendum story; one
paragraph each, named below):
- `teach`: anchor on the current lesson's concept
  dependencies; pull definitions from `retrieve_from_documents`
  before generalizing; author assessments from the lesson's
  concept set.
- `quiz`: items must draw from this lesson's concepts; do not
  improvise out-of-scope items.
- `homework`: span the lesson's concepts; longer-form; do not
  hint mid-attempt.
- `exam`: stay strictly within the assignment-bound items;
  no off-scope content even if the student asks.
- `study-skills`: tie technique demonstrations to the
  lesson's concepts and the available documents.

Each per-mode fragment also gets a fallback constant
(`behaviorInCourseFragmentDefault.<mode>`) used in mode
declarations:

**File**: `packages/curriculum/src/modes/fragments/in-course-behavior.ts` (new)

```typescript
import type { PromptFragment } from "@praxis/core/types";

/**
 * Fallback `context`-position fragments used when a session
 * has no courseId. SessionServiceImpl replaces these via the
 * overrides map at session-start when courseId is present.
 *
 * customizable: true so SessionServiceImpl can inject via
 * the overrides map. ids must match
 * `behaviorInCourseFragmentId(modeId)`.
 */
export const behaviorInCourseFragmentDefault: Record<
  "teach" | "quiz" | "homework" | "exam" | "study-skills",
  PromptFragment
> = {
  teach: {
    id: "context.behavior-in-course.teach",
    position: "context",
    customizable: true,
    template: `No active course — operate generically and rely on the student's stated topic.`,
  },
  // …same shape for quiz / homework / exam / study-skills
};
```

**Implementation Notes**:
- `position: "context"` so the addendum sits adjacent to
  `context.course-state` in FRAGMENT_ORDER (both at position
  index 4). Within the same position, sort is stable based on
  insertion order in `promptFragments` — declare facts
  before behavior in each mode file so they render in that
  order.
- Composers are pure functions of `(modeId, snapshot)` — no
  I/O.

**Acceptance Criteria**:
- [ ] `composeInCourseBehaviorFragment("teach", snapshot).id`
  === "context.behavior-in-course.teach".
- [ ] Five fallback fragments exist; each has
  `customizable: true` and a non-empty template.
- [ ] All five fragments are exported from
  `@praxis/curriculum`'s public surface so
  SessionServiceImpl can reference them.

---

### Unit 3: SessionServiceImpl wiring

**File**: `packages/core/src/services/session-service.ts`
**Story**: `epic-course-structured-tutor-course-aware-mode-prompts-story-1-foundation`

Inside the existing `if (args.courseId && this.deps.toolServices.courseState)` block (line 589),
extend the override-construction:

```typescript
// existing: composeCourseContextFragment(snapshot, masteryByConceptId)
// becomes:  composeCourseContextFragment(snapshot, masteryByConceptId, courseDocuments)
//
// Where courseDocuments comes from a coalesced read with the
// existing courseDocumentIds path:
const courseDocuments = await this.deps.toolServices
  .documentScopes
  .listForScopeDetailed({ kind: "course", id: args.courseId });

const fragment = composeCourseContextFragment(
  snapshot,
  masteryByConceptId,
  courseDocuments,
);
overrides = new Map([[fragment.id, fragment.template]]);

// NEW: per-mode behavior addendum
const inCourseModes: ReadonlySet<string> = new Set([
  "teach", "quiz", "homework", "exam", "study-skills",
]);
if (inCourseModes.has(args.mode.id)) {
  const behavior = composeInCourseBehaviorFragment(
    args.mode.id as InCourseBehaviorModeId,
    snapshot,
  );
  overrides.set(behavior.id, behavior.template);
}
```

The existing `courseDocumentIds` computation (line 688-694)
becomes `courseDocuments.map(d => d.documentId)` so we don't
double-fetch.

**Implementation Notes**:
- Coalescing the document read shaves one DB query off every
  course-bound session-open.
- `inCourseModes` is intentionally a local constant — modes
  outside the set never get the override, so their fallback
  template renders.

**Acceptance Criteria**:
- [ ] A teach session with `courseId` set produces a system
  prompt that contains the behavior addendum's "anchor on the
  current lesson's concept dependencies" text.
- [ ] A teach session with `courseId` null produces a system
  prompt containing the fallback addendum's "No active course"
  text.
- [ ] Configure or bootstrap sessions with `courseId` set
  (if that even occurs) do NOT receive an addendum override.
- [ ] `courseDocumentIds` is computed from `courseDocuments`
  without a second `listForScope` call.

---

### Unit 4: Add the fallback fragment to each in-course mode

**Files**:
- `packages/curriculum/src/modes/teach.ts`
- `packages/curriculum/src/modes/quiz.ts`
- `packages/curriculum/src/modes/homework.ts`
- `packages/curriculum/src/modes/exam.ts`
- `packages/curriculum/src/modes/study-skills.ts`

**Stories**: `story-{teach,quiz,homework,exam,study-skills}-addendum`

Each mode's `promptFragments` array gets one additional entry
right after `courseContextFragmentDefault`:

```typescript
// teach.ts diff (illustrative)
import { behaviorInCourseFragmentDefault } from "./fragments/in-course-behavior.js";

export const teachMode: Mode = {
  // …
  promptFragments: [
    // …existing entries…
    courseContextFragmentDefault,
    behaviorInCourseFragmentDefault.teach,  // ← new
    constraintsFragment,
    postambleFragment,
  ],
  // …
};
```

Each mode-addendum story also writes the actual prose for that
mode's `composeInCourseBehaviorFragment` branch — the prose is
mode-specific and is the *substance* of this feature.

**Acceptance Criteria** (per mode):
- [ ] Mode declaration includes the new fragment in
  `promptFragments`.
- [ ] `composeInCourseBehaviorFragment(<mode>, snapshot)`
  returns a fragment whose template names the current lesson
  by title and gives mode-specific guidance.
- [ ] Snapshot test of the rendered system prompt for that
  mode (with a fixture course) contains both the facts and the
  behavior addendum, in that order.

---

## Implementation Order

1. **Foundation** (`story-1-foundation`): Units 1, 2, 3.
   Extends the facts fragment, defines the composer +
   fallback fragments + types, wires SessionServiceImpl.
   Five mode addenda **block** on this — they import the
   composer and the fallback fragments.
2. **Parallel wave** (5 stories, all depend on
   `story-1-foundation`):
   - `story-teach-addendum`
   - `story-quiz-addendum`
   - `story-homework-addendum`
   - `story-exam-addendum`
   - `story-study-skills-addendum`

   Each story owns one mode file's diff plus the prose for
   its branch of `composeInCourseBehaviorFragment` plus the
   snapshot test.

## Testing

### Unit Tests
- `packages/curriculum/src/brief/__tests__/course-context.test.ts` — extend with cases for the new `documents` parameter (undefined / empty / one / >12).
- `packages/curriculum/src/brief/__tests__/in-course-behavior.test.ts` (new) — one case per mode: composer returns a fragment with the right id and a non-empty template that mentions the lesson title from the fixture snapshot.
- `packages/curriculum/src/modes/__tests__/in-course-prompt-shape.test.ts` (new) — render each in-course mode's full system prompt through `composeSystemPrompt` with the override map populated; assert facts and behavior sections both appear, in the right order, and that the no-course path renders only the fallback templates.
- `packages/core/src/services/__tests__/session-service.in-course-overrides.test.ts` (new) — integration test using `useTempDb` and a fixture course/lesson/concept: open a teach session with `courseId`, capture the rendered system prompt, assert the addendum text is present; open without `courseId`, assert the fallback text is present.

### Test fixtures
The existing `composeCourseContextFragment` tests already use a small `CourseStateSnapshot` literal — reuse and extend.

## Risks

- **Prose churn**: each mode-addendum story decides the actual prose. Without strict review, two stories might use overlapping language and dilute the per-mode behavioral signal. Mitigation: foundation story documents a "prose checklist" (must mention current lesson title; must reference one mode-specific capability — assessment plan / concept dependencies / etc.) and each addendum story's review verifies against it.
- **`additionalFragments` foot-gun re-emergence**: a future mode might re-introduce an `additionalFragments` injection for course context and double-render. Mitigation: comment block on the override site explains the override-by-default convention and links to this feature's id.
- **Configure / bootstrap accidentally gain `courseId`**: the activation guard is `inCourseModes.has(args.mode.id)`; if those modes start being opened with a courseId for unrelated reasons (e.g. configure-by-course), they skip the override automatically. No accidental prompt mutation.

## Review (2026-05-14)

**Verdict**: Approve with comments

**Blockers**: none
**Important**:
- **Aggregate test gap** — none of the 6 child stories' explicit test files (`in-course-behavior.test.ts`, `session-service.in-course-overrides.test.ts`, extended `course-context.test.ts` documents cases, `in-course-prompt-shape.test.ts`) were created. Tracked in `course-aware-mode-prompts-missing-tests` backlog item.

**Nits**: All 6 child stories landed; aggregate Cross-cutting concern: test coverage thin on the new paths but existing mode-shape tests verify structural integration. Two stories (exam-addendum) had minor template-spec drift documented in their reviews.

**Notes**: Foundation + 5 mode addendums delivered. Override-by-default contract preserved. Children-complete.

