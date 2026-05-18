---
id: epic-backend-fills-for-redesign-ui-completion-bundle-quiz-confidence
kind: story
stage: review
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

- [x] Confidence column persists per quiz response.
- [x] QuizTabBody surfaces the 4-button band per item.
- [x] Procedural-memory indexer consumes the value (verified by
      indexer test or projection assertion).
- [x] All quality checks green.

## Implementation notes

### Schema
- Added `confidence text("confidence", { enum: ["guessed", "unsure", "pretty_sure", "certain"] })`
  (nullable) to `assignmentResponses` in `packages/artifacts/src/schema.ts`.
- Migration `drizzle/0019_yummy_alice.sql`: `ALTER TABLE assignment_responses ADD confidence text;`
- Added `ConfidenceBand` type exported from `packages/core/src/types/artifacts.ts`.

### Write path
- `AssignmentServiceImpl.recordResponse` accepts `confidence?: ConfidenceBand` and persists/upserts it.
- `getResponses` maps the column back into the domain type.
- IPC schema in `ipc-server.ts` extended with `confidence: z.enum(...).optional()`.
- `AssignmentsClientImpl` and the `AssignmentsClient` interface in `client.ts` / `tool.ts` both updated.

### UI — confidence band placement
- `useAssignment` hook gains `confidences: Map<string, ConfidenceBand>` and `recordConfidence(itemId, band)`.
- `recordConfidence` immediately persists to DB (no debounce — lightweight write).
- `AssignmentCard` passes `confidence` + `onConfidenceChange` to `AssignmentItemCard` when `assignment.kind === "quiz"`.
- `AssignmentItemCard` renders a `<fieldset>` confidence band after the answer body and reasoning textarea.
  Band is optional (only shown when `onConfidenceChange` is provided). Selection is optional (not a submit gate).
  Styled as pill buttons matching the `.mockups/screens/epic-ui-redesign-ground-up-chat-workspace/mode-quiz.html` mock.

### Procedural indexer
- `ProceduralIndexerDeps` gains optional `sessionAssignmentId?: (sessionId: string) => string | null`.
- `readConfidences(sessionId)` queries `assignment_responses` for the session's assignment.
- `scoreSessionOutcome` accepts `confidencesByItemId: Map<string, ConfidenceBand>` (default empty map).
- Confidence modifier: `confidenceMean * 20` milli added after the session cap, max `+40`. This rewards
  students engaging with the self-assessment signal; `guessed=0, unsure=0.33, pretty_sure=0.67, certain=1.0`.
- `SessionOutcome` gains `confidenceCount: number` for observability.

### Tests
- Schema round-trip: 3 new cases in `packages/core/src/__tests__/assignment-service.test.ts`.
- UI: 5 new cases in `packages/ui/src/__tests__/assignment-item-card.test.tsx` covering band render,
  pip selection, `onConfidenceChange` callback, `aria-pressed`, disabled state.
- Indexer: 5 new cases in `procedural-indexer.test.ts` — confidence modifier logic in `scoreSessionOutcome`
  plus integration test via `seedAssignmentWithConfidence` (seeds FK chain: conceptGraph → course → assignment → response).
- All 3898 tests pass.
