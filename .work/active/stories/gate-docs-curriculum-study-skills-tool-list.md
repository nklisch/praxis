---
id: gate-docs-curriculum-study-skills-tool-list
kind: story
stage: implementing
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.0
gate_origin: docs
created: 2026-05-10
updated: 2026-05-10
---

# CURRICULUM.md `study-skills` mode description lists wrong tools

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/CURRICULUM.md:104-110`
- Code: `packages/curriculum/src/modes/study-skills.ts:25-49`

## Current doc text
> ### `study-skills`
> The metacognition coach's dedicated mode. Teaches and practices the
> principles-taught list above.
> - Tools: workspace tools (Cornell, Feynman, concept-map editors),
>   pedagogy-pack content retrieval, scheduling for spaced review.

## Reality
The actual `study-skills.ts` mode tool list contains:
`pedagogy.list_strategies`, `pedagogy.get_strategy`,
`pedagogy.list_techniques`, `pedagogy.get_technique`,
`pedagogy.list_metacognitive_prompts`, `course.what_can_i_teach`,
9 note/flashcard tools, and 4 quick-check tools (`single_choice`,
`multi_select`, `short_answer`, `confidence`). There are no concept-map
editor tools available in this mode and no "scheduling for spaced review"
tool exists at all (FSRS scheduling is internal to the flashcard tools,
not a separately surfaced capability).

## Required edit
Replace the bulleted tools line with the actual tool families exposed in
`study-skills.ts`: pedagogy-pack reads (5 `pedagogy.*` tools),
concept-graph navigation (`course.what_can_i_teach`), workspace tools
(5 `note.*` + 4 `flashcard.*`), and inline quick checks
(4 `quick_check.*` tools). Reference
`packages/curriculum/src/modes/study-skills.ts` as the canonical list
(matching the pattern used in the other mode entries).
