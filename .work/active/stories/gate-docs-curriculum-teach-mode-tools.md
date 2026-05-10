---
id: gate-docs-curriculum-teach-mode-tools
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

# CURRICULUM.md `teach` mode tool list omits Phase 17 + 18 tools

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/CURRICULUM.md:72`
- Code: `packages/curriculum/src/modes/teach.ts:31-60`

## Current doc text
> - Tools: `grade_math`, `code_sandbox`, `retrieve_from_textbook`,
>   course-navigation tools, `update_mastery`, `record_misconception`,
>   `assignment.create`, 9 note/flashcard tools, `sketch.read`. See
>   `packages/curriculum/src/modes/teach.ts` for the canonical list.

## Reality
`teach.ts` also lists 5 `quick_check.*` tools (`single_choice`,
`multi_select`, `short_answer`, `matching`, `confidence` — Phase 17) and
`pedagogy.list_metacognitive_prompts` (Phase 18). The doc's tool tally
is missing 6 tools.

## Required edit
Append the Phase 17 quick-check family
(`quick_check.{single_choice,multi_select,short_answer,matching,confidence}`)
and `pedagogy.list_metacognitive_prompts` to the teach-mode tools list.
