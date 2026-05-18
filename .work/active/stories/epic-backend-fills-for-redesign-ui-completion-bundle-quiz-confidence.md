---
id: epic-backend-fills-for-redesign-ui-completion-bundle-quiz-confidence
kind: story
stage: implementing
tags: []
parent: epic-backend-fills-for-redesign-ui-completion-bundle
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Quiz confidence band — schema + UI + indexer signal

## Scope

- Add `confidence` column to the quiz-response table.
- Render 4-button confidence band per item in `QuizTabBody`.
- Procedural-memory indexer reads the signal.

## Implementation steps

1. Schema:
   - Find the quiz response table (`packages/artifacts/src/schema.ts`
     or memory/curriculum). Add `confidence` column typed as
     `text("confidence", { enum: ["guessed", "unsure", "pretty_sure", "certain"] })`,
     nullable.
   - `pnpm db:generate` → migration. Verify with `pnpm db:reset`.

2. UI:
   - Edit `packages/ui/src/components/quiz-tab-body.{tsx,module.css}`:
     - After the item answer area, render a 4-button group ("guessed
       / unsure / pretty sure / certain") matching the mock
       (`.mockups/screens/.../-chat-workspace/mode-quiz.html`).
     - Selection is required before "submit" enables (or capture as
       optional per the mock — match the mock).
     - Stores the selection on the quiz-response row when the item
       is submitted.

3. Indexer:
   - Edit `packages/memory/src/indexers/procedural-indexer.ts`:
     - Pull the `confidence` value into the indexed event payload.
     - Existing scoring logic uses the value as a multiplier or
       direct signal (match existing patterns — see the indexer
       conventions docs).

4. Tests:
   - Schema round-trip via temp DB.
   - QuizTabBody renders the band; selection writes to the response.
   - Indexer asserts the confidence value lands in the procedural
     projection.

5. `pnpm typecheck && pnpm lint && pnpm test` green.

## Acceptance criteria

- [ ] Confidence column persists per quiz response.
- [ ] QuizTabBody surfaces the 4-button band per item.
- [ ] Procedural-memory indexer consumes the value (verified by
      indexer test or projection assertion).
- [ ] All quality checks green.
