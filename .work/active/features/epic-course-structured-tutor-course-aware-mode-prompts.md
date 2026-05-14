---
id: epic-course-structured-tutor-course-aware-mode-prompts
kind: feature
stage: drafting
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
