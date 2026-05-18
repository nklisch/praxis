---
id: epic-backend-fills-for-redesign-workbench-engine-recommendation-service
kind: story
stage: implementing
tags: []
parent: epic-backend-fills-for-redesign-workbench-engine
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Workbench RecommendationService — service + IPC + client

## Scope

Land the full `RecommendationService` per the parent feature design
(units 1–4). Service, IPC channel, client method, and tests in one
stride.

See `.work/active/features/epic-backend-fills-for-redesign-workbench-engine.md`
for the architectural choice, type contracts, scoring table, and
reason-string templates.

## Implementation steps

1. **Types**
   - New `packages/core/src/types/recommendation.ts` with the
     `Recommendation` discriminated union and `RecommendationService`
     interface per the parent feature.
   - Re-export from `packages/core/src/types/index.ts`.

2. **Service**
   - New `packages/core/src/services/recommendation-service.ts`.
   - Implement `RecommendationServiceImpl` with five collector
     methods + the aggregator.
   - Score using the static table from the parent feature.
   - Reason strings via per-kind helpers. Pull mocked strings from
     `.mockups/screens/.../-discovery-surfaces/option-4.html`
     verbatim where they match.

3. **Inputs / readers**
   - Use existing services: `SessionsReader` (or whatever method
     surfaces open sessions for a student), `FlashcardsService`,
     `MemoryService`, `DraftStore`, `ArtifactsService` (for lesson
     titles).
   - If `flashcards.listDueByStudent` doesn't exist, add a thin
     helper that queries by `nextReviewAt <= now`.
   - If `memory.listLowMasteryConcepts` doesn't exist, add it as a
     reader that returns concepts whose mastery is below their
     gate threshold.

4. **DI wiring**
   - Add `recommendations: RecommendationService` to `ServiceDeps`.
   - Instantiate in `buildServices` (or the equivalent composition
     root).

5. **IPC**
   - Add channel `praxis.recommendations.next` to a new
     `packages/desktop/electron/main/recommendations-channel.ts` per
     `per-domain-channel-module`. Use `wrapEnvelope` +
     `withSchema(z.object({ limit: z.number().optional() }), fn)`.
   - Wire into `ipc-server.ts`.

6. **Client**
   - Add `recommendations` namespace to `PraxisClient` with
     `next({ limit?: number })` method.

7. **Tests**
   - `packages/core/src/services/__tests__/recommendation-service.test.ts`
     using `useTempDb()`.
   - Per-collector fixture tests (one per kind).
   - Mixed-input ordering test.
   - Reason-string content tests covering each branch.
   - Limit / tie-break determinism.
   - IPC harness test via `electron-ipc-test-harness`.

8. **Quality checks**
   - `pnpm typecheck && pnpm lint && pnpm test` green.

## Acceptance criteria

- [ ] `RecommendationService.next` aggregates five collector kinds and
      returns priority-ordered results with `score` + `reason` filled.
- [ ] Scoring matches the table in the parent feature; tie-break is
      descending recency and is deterministic.
- [ ] Limit (default 5) is respected.
- [ ] IPC channel `praxis.recommendations.next` registered, wrapped,
      and tested.
- [ ] Client surface `praxisClient.recommendations.next(...)` works
      end-to-end against a Vitest IPC harness.
- [ ] All new and existing tests green.

## Out of scope

- Workbench UI itself (lives in
  `epic-ui-redesign-ground-up-discovery-surfaces`).
- A learned / ML ranking layer. The static table is the v1 spec.
- Background pre-compute. On-demand only.
- Localization of reason strings.
