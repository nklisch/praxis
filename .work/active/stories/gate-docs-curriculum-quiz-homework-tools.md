---
id: gate-docs-curriculum-quiz-homework-tools
kind: story
stage: implementing
tags: [documentation]
parent: feature-release-v0.1.0-doc-findings
depends_on: []
release_binding: v0.1.0
gate_origin: docs
created: 2026-05-10
updated: 2026-05-10
---

# CURRICULUM.md `quiz` and `homework` mode tool lists omit `pedagogy.list_metacognitive_prompts`

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/CURRICULUM.md:80,89`
- Code: `packages/curriculum/src/modes/quiz.ts:44`,
  `packages/curriculum/src/modes/homework.ts:34`

## Current doc text
> (line 80) Tools: `assignment.show`, `assignment.read_grade`,
> `course.what_can_i_teach`, `course.current_concept`,
> `retrieve_from_textbook`, `grade_math`, `code_sandbox`,
> `update_mastery`, `record_misconception`
> (line 89-90) `homework` — Tools: same as `quiz`

## Reality
`quiz.ts:44` adds `pedagogy.list_metacognitive_prompts` (Phase 18).
`homework.ts:34` reuses `quizMode.toolNames`, so both modes have it. The
doc's quiz tool list is missing this entry.

## Required edit
Append `pedagogy.list_metacognitive_prompts` to the quiz-mode tool list
(homework inherits via "same as quiz").
