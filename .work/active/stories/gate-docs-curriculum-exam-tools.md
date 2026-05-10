---
id: gate-docs-curriculum-exam-tools
kind: story
stage: done
tags: [documentation]
parent: feature-release-v0.1.0-doc-findings
depends_on: []
release_binding: v0.1.0
gate_origin: docs
created: 2026-05-10
updated: 2026-05-10
---

# CURRICULUM.md `exam` mode tool list claims "and nothing else" but Phase 18 added a tool

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/CURRICULUM.md:98`
- Code: `packages/curriculum/src/modes/exam.ts:33-41`

## Current doc text
> - Tools: `assignment.show`, `assignment.read_grade`, `sketch.read`,
>   `clarification` (and nothing else). The `clarification` tool
>   (Phase 16) lets the agent rephrase a confusing prompt without
>   revealing method or answer. See `packages/curriculum/src/modes/exam.ts`
>   for the canonical list.

## Reality
`exam.ts` line 38 adds `pedagogy.list_metacognitive_prompts` (Phase 18 —
labeled "session-end reflection; read-only metadata, safe in
verification stance"). The "(and nothing else)" claim is now false.

## Required edit
Add `pedagogy.list_metacognitive_prompts` to the exam tool list and
update the surrounding sentence ("and nothing else" → drop, or expand
to note this read-only pedagogy lookup is acceptable in the verification
stance because it returns metadata, not method/answer help).

## Implementation notes
Dropped "(and nothing else)" and appended `pedagogy.list_metacognitive_prompts` with an inline rationale: read-only metadata, not method/answer help, consistent with verification stance. Matches the comment in `exam.ts:38`.

## Review (2026-05-10)

The "(and nothing else)" claim was factually incorrect after Phase 18. The rationale for allowing `pedagogy.list_metacognitive_prompts` in exam mode (read-only metadata, verification stance maintained) is well-reasoned and consistent with `exam.ts:38`'s inline comment. No rolling-foundation violations. Approve.
