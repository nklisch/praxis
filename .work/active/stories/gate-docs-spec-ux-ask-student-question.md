---
id: gate-docs-spec-ux-ask-student-question
kind: story
stage: drafting
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: docs
created: 2026-05-12
updated: 2026-05-12
---

# SPEC.md and UX.md don't mention the `ask_student_question` structured-choice tool or `<StructuredQuestionCard>` UI

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/SPEC.md` (no entry); `docs/UX.md` (no entry)
- Code: `packages/tools/src/dialog/ask-student-question.ts`, `packages/ui/src/components/structured-question-card.tsx`

## Current doc text
SPEC.md has a "Human-in-the-loop tool dispatch" section that documents the `quick_check.*` pattern (Phase 17). UX.md has an "Inline quick-check cards" section. Neither mentions `ask_student_question`.

## Reality
`ask_student_question` is a new dialog primitive for bootstrap and configure modes — an inline structured-choice prompt rendered via `<StructuredQuestionCard>`. Uses the same human-in-the-loop dispatch pattern as `quick_check.*` but is scoped to authoring/explorer flows rather than formative assessment. Landed via `epic-bootstrap-readiness-structured-questions`.

## Required edit
In SPEC.md "Human-in-the-loop tool dispatch", add a paragraph noting that `ask_student_question` is a second consumer of the same dispatch pattern (scoped to bootstrap/configure). In UX.md, add a "Structured question cards" subsection under the chat workspace covering visual treatment and locked-state behavior.
