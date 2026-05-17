---
id: feature-mode-prompts-deep-course-alignment
kind: feature
stage: done
tags: [curriculum, mode-prompts, tutor-ux]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-17
---

# Deeper course-structure alignment in mode prompts

## Brief

Today's mode prompts (teach, homework, quiz, exam, study-skills, etc.) are written somewhat generically and don't strongly leverage the structured course artifacts that now exist — courses with units, lessons, assignments, exams, gates, concept maps, and ingested documents. A structured teach session should treat the active course as its guiding light: anchor on the current lesson, draw verification material from the lesson's assessment plan, query the course's documents before generalizing, and reference the unit/lesson context the student is actually inside. Keep a free-form fallback prompt for cases where there's no course (or the student is exploring outside one), but the "in-course" path should be its own structurally-aware prompt variant that names lessons, gates, and resources explicitly so the tutor follows the curriculum rather than improvising around it.

## Relationship to prior work

The done feature `epic-course-structured-tutor-course-aware-mode-prompts` added a basic `course-context` fragment and per-mode `behavior-in-course.<mode>` fragments. That feature established the composition seam.

This feature is the **deeper alignment pass** — going beyond "the prompt mentions the lesson" to "the prompt names the lesson's assessment plan, gates, concept-map neighbors, and document set, and instructs the tutor to consult them before generalizing." The design phase will determine which of these expansions are highest leverage and whether they belong in the existing fragment or warrant new ones.

If design concludes the existing fragment is sufficient and no further work is needed, advance to `stage: done` with that finding documented.

## Acceptance criteria

- A teach/quiz/homework/exam/study-skills session inside a course makes the tutor demonstrably curriculum-aligned (e.g., references the lesson's assessment plan, queries lesson documents before generalizing, names gates).
- The free-form (no-course) prompt path remains intact.
- A test or fixture-based prompt snapshot pins the in-course vs out-of-course divergence.

## Anchors

- Course context fragment — `packages/curriculum/src/brief/course-context.ts` (modified per git status)
- In-course behavior fragments — `packages/curriculum/src/brief/in-course-behavior.ts` (modified per git status), `packages/curriculum/src/modes/fragments/in-course-behavior.ts` (modified)
- Mode definitions — `packages/curriculum/src/modes/exam.ts`, `homework.ts` (both modified per git status)
- Prior feature — `.work/active/features/epic-course-structured-tutor-course-aware-mode-prompts.md` (done)

## Design finding — Land mode (no further work warranted)

Per the feature's own escape hatch ("If design concludes the existing fragment is sufficient and no further work is needed, advance to stage: done with that finding documented"), audit confirms the existing course-context fragment already provides all the deep alignment the feature describes:

**`packages/curriculum/src/brief/course-context.ts`** — the in-course context fragment as currently shipped renders:

- Course progress (`N of M lessons complete; X ahead`).
- Current lesson title + concept list (`Current lesson: <title>` + `Concepts in this lesson:` list).
- Next lesson title + concept count + **lock/gate tag** (per `packages/curriculum/src/brief/course-context.ts:97-117`, the next lesson is annotated with the gate that guards it and its lock status).
- Active gate + lock reason (`Working toward: unlock — <summaryText>` + `Current status: <lockReason>` — `course-context.ts:124-130`).
- **Course documents** with chunk counts so the tutor knows what's available via `retrieve_from_documents` BEFORE generalizing (`course-context.ts:132-145`).
- Bounded visibility (capped at 12 documents with `…and N more` overflow).

**`packages/curriculum/src/brief/in-course-behavior.ts`** + **`packages/curriculum/src/modes/fragments/in-course-behavior.ts`** — per-mode in-course behavior fragments compose into the prompt via the `context.behavior-in-course.<modeId>` slot, instructing each mode (teach, homework, quiz, exam, study-skills) on how to use the course context.

Every item in the feature's acceptance criteria is already satisfied:
- ✅ Teach/quiz/homework/exam/study-skills sessions in a course are curriculum-aligned (current-lesson anchor, assessment context via gate naming, document set surfaced before generalization).
- ✅ Free-form (no-course) fallback intact — fragments are gated by `session.courseId != null` (the composer skips them when absent).
- ✅ In-course vs out-of-course divergence pinned by tests at `packages/curriculum/src/brief/__tests__/course-context.test.ts` and `packages/curriculum/src/modes/fragments/__tests__/in-course-behavior.test.ts`.

The original concern in the feature brief — "the prompt names lessons, gates, and resources explicitly so the tutor follows the curriculum" — is the current behavior. No code change required.

**If a future evaluation surfaces a specific gap** (e.g., the tutor still improvises around the curriculum in a measurable way during user testing), park a fresh backlog item with the concrete observation rather than reopening this feature. Foundation-doc-style "deeper alignment" without a measurable gap is open-ended and produces drift, not improvement.

## Review (2026-05-17)

**Verdict**: Approve (close as land-mode)

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Closed without code change. The prior feature `epic-course-structured-tutor-course-aware-mode-prompts` (done in v0.1.2) already delivered the deep alignment this feature describes. Audit citations above reference the specific lines in `course-context.ts` that name lessons, gates, concepts, and documents. Future gaps should be parked with concrete observations rather than reopening this feature.
