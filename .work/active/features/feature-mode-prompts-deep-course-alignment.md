---
id: feature-mode-prompts-deep-course-alignment
kind: feature
stage: drafting
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
