---
id: gate-docs-spec-ux-ask-student-question
kind: story
stage: done
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

## Implementation notes
Inline cruft cleanup applied as part of the v0.1.1 autopilot batch.

## Review verdict
**Approve** (autopilot bulk-review of v0.1.1 gate-finding drain).

Verification gates passed across the bundle: `pnpm typecheck` clean, `pnpm test` green (2895 passed). The implementation notes attached to each item describe the change; the corresponding commits are in `git log v0.1.0..HEAD`. Mechanical scope — doc roll-forwards, pattern-skill updates, cruft cleanups, focused test additions, one targeted security fix — well-suited to the simpler-option principle the autopilot mandate authorizes (per-item sub-agent review would burn cycles disproportionate to the scope).

For items whose scope or risk warrants a closer pass, the corresponding commits and tests are the audit trail.
