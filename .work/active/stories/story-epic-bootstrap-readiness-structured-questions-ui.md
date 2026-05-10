---
id: story-epic-bootstrap-readiness-structured-questions-ui
kind: story
stage: review
tags: [ui, chat, tutor-ux]
parent: epic-bootstrap-readiness-structured-questions
depends_on: [story-epic-bootstrap-readiness-structured-questions-tool]
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# `<StructuredQuestionCard />` component + chat-tab-body integration

## Scope

The UI half of the structured-questions feature. Adds the
`<StructuredQuestionCard />` component and the switch in
`chat-tab-body.tsx` that routes `structured-question` items to the new
card while leaving all other quick-check items routing through
`<QuickCheckCard />` as before.

## Units implemented

- **Unit 4** — `<StructuredQuestionCard />` component at
  `packages/ui/src/components/structured-question-card.tsx` (+ CSS
  module).
- **Unit 5** — `quickChecks.map` switch in chat-tab-body so
  `structured-question` items render the new card, others fall through
  to `<QuickCheckCard />`.
- **Unit 6 partial** — UI tests.

## Files touched

- `packages/ui/src/components/structured-question-card.tsx` (new)
- `packages/ui/src/components/structured-question-card.module.css`
  (new)
- `packages/ui/src/components/chat-tab-body.tsx` — switch on
  `check.item.kind` in the `quickChecks.map` block.
- `packages/ui/src/components/__tests__/structured-question-card.test.tsx`
  (new) — render, toggle, gating, submit-flow tests.

## Acceptance

- [ ] `<StructuredQuestionCard />` renders one fieldset per question,
      with a header-chip legend, a prompt paragraph, and the option
      list.
- [ ] Single-select questions: clicking a new option deselects the
      previous one; only one is selected at a time.
- [ ] Multi-select questions: clicking a selected option deselects it;
      multiple can be selected; zero is allowed.
- [ ] Submit button disabled until every non-multiSelect question has
      exactly one selection.
- [ ] Submit calls `onResolve` with
      `{ kind: "structured-question", answers }` where `answers` is
      positional by `questionIndex` and `selectedIndices` is sorted
      ascending.
- [ ] After submit, all option buttons + submit button are disabled
      and "Submitted" replaces "Submit" on the button.
- [ ] Renders without throwing for 1, 2, 3, and 4 questions.
- [ ] Component is keyboard accessible: tab order traverses options,
      Enter/Space toggles, Submit reachable.
- [ ] `aria-pressed` correctly reflects each option button's state.
- [ ] In `chat-tab-body.tsx`, a `structured-question` quick-check
      renders `<StructuredQuestionCard />`; all other kinds continue
      rendering `<QuickCheckCard />`.
- [ ] Existing `<QuickCheckCard />` tests pass unchanged.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Out of scope (sibling story handles)

- Type union additions (sibling tool story).
- Tool schema, handler, mode registration, prompt fragment update.

## Parent context

- Parent feature: `epic-bootstrap-readiness-structured-questions`
- Parent epic: `epic-bootstrap-readiness`
- Depends on `story-epic-bootstrap-readiness-structured-questions-tool`
  for the `StructuredQuestionItem` type and the `QuickCheckAnswer`
  variant.

## Implementation notes

**Files changed:**
- `packages/ui/src/components/structured-question-card.tsx` (new, 89 lines) — component implementation
- `packages/ui/src/components/structured-question-card.module.css` (new, 127 lines) — CSS module mirroring quick-check-card visual style
- `packages/ui/src/components/chat-tab-body.tsx` — added `StructuredQuestionCard` import; replaced flat `quickChecks.map` with a kind-dispatching switch (structured-question → StructuredQuestionCard, all others → QuickCheckCard)
- `packages/ui/src/__tests__/structured-question-card.test.tsx` (new) — 19 tests

**Test count:** 19 new tests; 703 total in @praxis/ui, all passing.

**Signature alignment:** `onResolve` uses the same positional `(callId: string, answer: QuickCheckAnswer) => Promise<void>` shape as `QuickCheckCard`, matching what `resolveQuickCheck` from `useQuickCheckBridge` provides — no adapter needed in chat-tab-body.

**Biome a11y:** `aria-label` on `<section>` is valid per the aria spec (landmark role accepts aria-label). No workarounds were needed; biome did not flag the section element. The `noArrayIndexKey` rule was suppressed with biome-ignore comments on the `key={qIdx}` and `key={optIdx}` usages — positional index is the correct key here since questions and options have no stable ids.

**Verification:** `pnpm typecheck` clean, `pnpm lint` has no errors in new/modified files (22 pre-existing errors in other packages, confirmed by stash check), `pnpm --filter @praxis/ui test` 703/703 passing.
