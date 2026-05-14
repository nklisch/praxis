---
id: epic-ui-rendering-stability-state-transitions-question-card-collapse
kind: story
stage: review
tags: [ui, bug]
parent: epic-ui-rendering-stability-state-transitions
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# Question card collapses to compact summary after submit

## Scope

Replace the `submitted` rendering branch of `<QuickCheckCard>` with a
compact one-line summary row: question stem + student's answer +
correct/incorrect badge (or no badge for ungraded items). Match the
visual shape of `<ToolEntry>`'s settled state so card retirement
looks consistent across the chat thread.

This story implements Unit 1 of
`epic-ui-rendering-stability-state-transitions` — see the parent
feature body for full design (interfaces, grading rules per item
kind, CSS notes, acceptance criteria, risks).

## Files touched

- `packages/ui/src/components/quick-check-card.tsx` — add
  `gradeAnswer`, `stemOf`, `summariseAnswer`, `setsEqual`,
  `pairSetsEqual` helpers; capture `lastAnswer` + derived `correct`
  at submit; swap render branches.
- `packages/ui/src/components/quick-check-card.module.css` — add
  `.collapsedSummary`, `.collapsedStem`, `.collapsedAnswer`,
  `.badgeCorrect`, `.badgeIncorrect`, `.collapsedDetails`,
  `.disclosure`.
- `packages/ui/src/__tests__/quick-check-card.test.tsx` — edit the
  "locks inputs after submission" test; add five new tests per the
  parent feature's acceptance list.

## Out of scope

- `<StructuredQuestionCard>` (sibling component) — collapsed view
  for the structured-question shape is deferred. Document but do
  not refactor. The card renders the collapsed row WITHOUT a badge
  when reached via `QuickCheckCard`'s fallback branch.
- A shared `gradeQuickCheckAnswer(item, answer)` package — the
  copied 2-line helpers are pure; share later only if a real
  drift surfaces.
- Persistent disclosure state across re-mounts. The collapsed
  view's "expand details" toggle is component-local.

## Acceptance criteria

Reproduces parent feature Unit 1 acceptance criteria verbatim:

- [ ] After submit, the card's expanded body is replaced by a
  one-line summary row containing the stem, the student's answer,
  and a correct/incorrect badge (or no badge for ungraded items).
- [ ] The collapsed row is a `<button>` with `aria-expanded`;
  clicking it toggles a read-only `details` block.
- [ ] For `single-choice` with `correctOptionIndex === -1`
  (formative-probe sentinel), no badge is rendered.
- [ ] For `structured-question` (via the fallback path), the
  collapsed row renders without a badge.
- [ ] Existing test "locks inputs after submission" passes after
  one edit (assert on stem/badge presence and absence of pre-submit
  controls).
- [ ] Five new tests pass — see parent feature for full list.
- [ ] `pnpm --filter @praxis/ui test` green.
- [ ] `pnpm typecheck && pnpm lint` green.

## Implementation hint

The card has all the information it needs locally: `AssignmentItem`
already carries the answer key per kind (`correctOptionIndex`,
`correctOptionIndices`, `acceptedAnswers`, `correctPairs`). Compute
correctness at submit, store on the existing state machine. No new
IPC, no engine-event subscription, no bridge changes.

For the visual vocabulary, read `tool-entry.tsx` and
`tool-entry.module.css` and mimic the `.settled` branch's button +
disclosure-triangle + summary text pattern.
