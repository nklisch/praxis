---
id: epic-backend-fills-for-redesign-workbench-engine
kind: feature
stage: done
tags: []
parent: epic-backend-fills-for-redesign
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Workbench recommendation engine

## Brief

The locked Workbench discovery surface (`epic-ui-redesign-ground-up-discovery-surfaces`
Option 4) opens with **"There's three things ready for you"** — a
priority-ordered queue of actions the student should pick up *right now*,
each with a reason string ("Continuing now keeps the chain — coming back
tomorrow loses the thread"). Without a backend recommendation service, the
Workbench falls back to a flat "recent sessions" list and loses its
distinctive posture.

This feature adds a new **`RecommendationService`** in `@praxis/core` that
returns priority-ordered "what's next" items. Inputs: open sessions
(paused / mid-conversation), spaced-review queue (cards due now / soon),
mastery state (concepts under threshold that gate next lessons), pending
course-create drafts, suggested quick-checks. Output: an ordered list of
typed action items with reason strings and CTAs.

What this feature does **not** cover: the Workbench UI itself (lives in
`epic-ui-redesign-ground-up-discovery-surfaces` implementation); the
spaced-review scheduler (assumed to exist or be added separately).

## Epic context

- Parent epic: `epic-backend-fills-for-redesign`
- Position in epic: **independent** — no within-epic deps. Can land in
  parallel with everything else.
- UI co-ships with: `epic-ui-redesign-ground-up-discovery-surfaces`
  implementation (which consumes this service to render the Workbench).

## Foundation references

- `docs/ARCHITECTURE.md` § "Components" → `@praxis/core` (will add
  `RecommendationService` to the responsibility list when this ships)
- `docs/CURRICULUM.md` § "Adaptive routing" — the route already
  suggests modes after N concepts / mastery thresholds; this service
  generalises that pattern to the front-door queue
- `.mockups/screens/epic-ui-redesign-ground-up-discovery-surfaces/option-4.html`
  — the Workbench mock that consumes this service
- `.mockups/flows/session-loop/01-workbench.html` + `05-session-end.html`
  — flow showing the queue refresh after a lesson lands

## Design decisions

- **New service, not extension of an existing one.** Aggregation across
  open sessions, due cards, mastery state, drafts, and quick-checks
  doesn't fit naturally inside any existing service's responsibility.
  Lives in `@praxis/core/services/recommendation-service.ts`.
- **Pure aggregator — no new persistence.** The service reads existing
  state (sessions, flashcards, memory, drafts); it does not record
  recommendations. Re-computing on demand is cheap and avoids
  cache-staleness bugs.
- **Reason strings are composed, not stored.** Each recommendation kind
  has a template that interpolates concrete numbers (cards due, hours
  since last touch, concept count). English-only in v1.
- **Stable ordering, not ML.** Priority is a small integer score with
  a deterministic tie-break (recency). The visible reason strings
  describe *why* a thing is high, which means the algorithm must be
  readable.

## Architectural choice

A composition of typed signal collectors fanning into a single
priority-sorted list. `RecommendationService.next({ studentId, limit })`
calls each collector, scores results, sorts descending, dedupes, and
returns the top `limit` (default 5).

Considered and rejected:
- **Extend `Router` (curriculum)** — too narrow; the router answers
  "given a course, what concept next?" not "across all surfaces."
- **Indexer-style pre-compute** — staleness on every session event;
  on-demand is cheap enough that pre-compute isn't worth it.

## Implementation Units

### Unit 1: types + service interface

**File**: `packages/core/src/types/recommendation.ts` (new)

```ts
export type Recommendation =
  | { kind: "resume_session"; sessionId: SessionId; mode: ModeId;
      lastTouchedAt: Timestamp; reason: string; score: number }
  | { kind: "review_cards"; courseId: CourseId | null;
      dueNow: number; dueIn24h: number; reason: string; score: number }
  | { kind: "practice_concept"; conceptId: ConceptId; courseId: CourseId;
      mastery: number; threshold: number; reason: string; score: number }
  | { kind: "resume_draft"; draftId: DraftId; lastTouchedAt: Timestamp;
      reason: string; score: number }
  | { kind: "quick_check"; lessonId: LessonId; reason: string; score: number };

export interface RecommendationService {
  next(input: { studentId: StudentId; limit?: number }): Promise<Recommendation[]>;
}
```

### Unit 2: collectors + scoring

**File**: `packages/core/src/services/recommendation-service.ts` (new)

Five collector methods, each returning a partial `Recommendation` list
without `score` / `reason` filled in. The aggregator scores them per a
small static table:

| Kind | Base | Boost rule |
|---|---|---|
| `resume_session` | 80 | +10 if `lastTouchedAt < 6h` ago; –20 if > 7d |
| `review_cards` (dueNow > 0) | 75 | +5 per 10 dueNow (cap +20) |
| `practice_concept` | 60 | +`(threshold - mastery) * 50` (cap +30) |
| `resume_draft` | 55 | +10 if < 24h since last touch |
| `quick_check` | 40 | no boost — opportunistic |

Tie-break: descending recency (`lastTouchedAt` or implicit "now").

Reason strings: pure function per kind. Examples:
- `resume_session` <6h: `"Continuing now keeps the chain — coming back tomorrow loses the thread."`
- `resume_session` ≥6h: `"Paused {humanize(now - lastTouchedAt)}. Pick up where you left off."`
- `review_cards`: `"{dueNow} cards ready to review."` (+24h variant)
- `practice_concept`: `"{conceptName} mastery {mastery*100|0}% (target {threshold*100|0}%) — gates next lesson."`
- `resume_draft`: `"Course-create draft from {humanize(...)} ago."`
- `quick_check`: `"Quick check on '{lessonTitle}' takes ~3 minutes."`

Match the locked mock copy verbatim where present
(`.mockups/screens/.../-discovery-surfaces/option-4.html`); improvise
for kinds the mock doesn't enumerate.

### Unit 3: IPC + client

- IPC channel `praxis.recommendations.next` (envelope wrapped per
  `ipc-envelope-handler`) → `Recommendation[]`.
- Client: `praxisClient.recommendations.next({ limit?: number })`.

### Unit 4: Tests

`packages/core/src/services/__tests__/recommendation-service.test.ts`:
- Per-collector fixtures (uses `useTempDb()`).
- End-to-end ordering with mixed inputs.
- Reason-string content per kind / boost branch.
- Limit + tie-break determinism.
- IPC handler test via `electron-ipc-test-harness`.

## Implementation Order

Single story:
`epic-backend-fills-for-redesign-workbench-engine-recommendation-service`.

## Acceptance Criteria

- [ ] `RecommendationService.next` returns priority-ordered results
      for a seeded fixture (open sessions, due cards, low mastery,
      drafts).
- [ ] Each result carries `score` and `reason`; reasons match the
      mocked copy where present.
- [ ] `limit` is respected; tie-break ordering is deterministic.
- [ ] IPC channel `praxis.recommendations.next` round-trips.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Risks

- **Spaced-review queue depends on infra that may need a thin
  helper.** If `flashcards.listDueByStudent` doesn't exist, the
  story adds it as a one-liner SQL helper. Document the assumption
  in-story.
- **Mock copy may evolve.** Treat the mockup strings as the spec;
  if they shift after this lands, refresh in a follow-up story
  rather than chasing them in flight.

## Review (2026-05-17)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Single child story `epic-backend-fills-for-redesign-workbench-engine-recommendation-service`
landed cleanly at `stage: done`. All acceptance criteria met: five collectors aggregate into a
priority-sorted list with scores and reason strings matching the design spec; `limit` is respected
and tie-break is deterministic by recency; IPC channel `praxis.recommendations.next` is
envelope-wrapped and tested (6 harness tests); client surface added to `PraxisClient`; 36
service tests + 6 IPC harness tests all green. Foundation-doc drift addressed: `docs/ARCHITECTURE.md`
`@praxis/core` entry updated to list `RecommendationServiceImpl`. `DraftStore` shared instance
correctly injected into both `BootstrapServiceImpl` and `RecommendationServiceImpl`. No
blockers, no important findings.
