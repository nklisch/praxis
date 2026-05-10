---
id: epic-phase-18-procedural-memory
kind: feature
stage: done
tags: [content]
parent: epic-phase-18-study-skills
depends_on: [epic-phase-18-pedagogy-pack]
release_binding: v0.1.0
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Procedural memory — indexer + read path

## Brief

Procedural memory captures strategy preferences for *this* student — whether
worked-examples teaches them well, whether Socratic on novel material
frustrates them. The schema already exists (`procedural_strategies` table,
keyed by `(studentId, strategyId)` with a `preferenceMilli` (-1000..1000)
column and `evidenceCount`). The query path is a stub
(`packages/core/src/services/memory/memory-service.ts:133`,
`Phase 14 stub`).

What this delivers:

- Replace the procedural stub: real read of `procedural_strategies` rows into
  the `ProceduralModel` shape (`Map<StrategyId, StrategyPreference>`).
- New `ProceduralIndexer` agent in `packages/core/src/services/indexers/` —
  follows the existing indexer pattern (`mastery-indexer`,
  `misconception-indexer`): small, narrow-purpose, prompt-driven. Reads
  recent episodic events (tool calls, model messages, grades) plus strategy
  metadata from the pedagogy pack, infers preference deltas per strategy id,
  writes them via `MemoryService.applyStrategySignal()` (or similar — exact
  shape decided in design pass).
- Wire the indexer into `IndexerOrchestrator` so it runs debounced
  post-session alongside mastery and misconception.
- Test coverage for the read path (round-trip of stored rows) and the
  indexer agent (golden inputs producing expected preference deltas).

What this feature does NOT cover: routing logic that *uses* the procedural
projection — that's `epic-phase-18-routing-integration`. This feature stops
at "the projection is fed from sessions and readable through the
MemoryService."

## Epic context

- Parent epic: `epic-phase-18-study-skills`
- Position in epic: parallel sibling to `affective-memory`; both feed the
  routing-integration feature downstream.

## Foundation references

- `docs/CONTRACT.md` — `ProceduralModel` shape (line ~681), `MemoryService`
  procedural query (line ~881)
- `docs/ARCHITECTURE.md` — Memory architecture / Indexer agents section
- `docs/CURRICULUM.md` — adaptive routing's procedural inputs

## Design decisions

- **Schedule: session-end.** Strategy preference is an aggregate signal —
  it doesn't need real-time updates within a turn. Mirrors mastery and
  affective indexers.
- **Heuristic v1 (no LLM).** Score the session's outcome from
  deterministic events (grade_math correctness, course.mark_studied,
  code_sandbox exit codes), attribute the delta to the lesson's
  `suggestedStrategy`, write. No model call needed. Simpler,
  deterministic, cheap. If signal quality is poor, a future feature can
  add LLM-based "what strategy was the tutor actually using" inference.
- **Strategy attribution = lesson.suggestedStrategy.** The teach-mode
  tutor doesn't emit explicit "I'm using strategy X" events. Use the
  lesson's declared strategy as the proxy. The router will be the
  ultimate consumer; the tutor and the router both read this same field
  to pick a strategy, so attributing outcomes to the same source closes
  the feedback loop.
- **Loss aversion** (asymmetric delta): negative experiences nudge
  preference 2× faster than positive ones (`net < 0` → `delta *= 2`).
  Cognitive-science precedent (Tversky & Kahneman, 1979) and a
  pedagogically reasonable bias — students remember what didn't work
  and we should avoid those approaches faster than we cement what did
  work.
- **Per-session bound**: delta clamped to `[-300, +300]` milli per
  session. Caps single-session influence so one outlier (e.g. a
  frustrated session that happened to use a strategy that's actually
  great long-term) doesn't dominate the running preference.
- **Validate against pedagogy pack.** If the lesson's
  `suggestedStrategy` isn't a known strategy id in the loaded pack, skip
  the write and log debug. Guards against stale `StrategyId`s
  surviving in `lessons.suggestedStrategy` across pack version bumps.
- **Net == 0 skip.** A session with equal correct/incorrect counts
  produces no signal — skip rather than writing a zero-delta row that
  bumps `evidenceCount` without information.
- **Active-path tools** (`update_mastery`, `record_misconception`):
  these tools write to mastery / misconception directly. They aren't
  among the tool names this indexer reads, so no double-counting concern
  in v1. Documented for safety so a future tool addition triggers
  re-evaluation.

## Architectural choice

Heuristic deterministic indexer. Considered alternatives:

- **LLM-based strategy detection.** The model reads the transcript and
  infers which teaching strategy was actually used. Higher fidelity but
  costs an LLM call per session and adds prompt-quality risk to the
  feedback loop. Rejected for v1; the heuristic produces the right
  shape for the ROADMAP test checkpoint ("preferences reflect strategy
  preferences"). Upgrade to LLM detection if heuristic precision is
  insufficient when the routing-integration feature lands.
- **Per-attempt scoring (every grade event)**. Track preference deltas
  per individual attempt rather than per session. More granular but
  heavier per-write cost and the `proceduralStrategies` table doesn't
  carry per-attempt timestamps. v1 aggregates per session.

The chosen shape mirrors the project's existing indexer conventions
exactly: session-end, deps-injected, single-table write, idempotent on
the (studentId, strategyId) key.

## Implementation Order

One child story:

1. `epic-phase-18-procedural-memory-indexer` (no deps) — implements the
   read path, the `ProceduralIndexer` with `scoreSessionOutcome`
   helper, services wiring, and tests in one stride. The whole feature
   is ~250 lines of TS + tests; the parallelization gain from splitting
   wouldn't repay the orchestration overhead. Mirrors the
   `affective-memory-indexer` shape (which also went single-story).

## Risks

- **Heuristic signal quality.** The session-score heuristic
  (correct - incorrect) may be too coarse for fine-grained strategy
  comparison. A student who struggles on a worked-examples lesson might
  not be a worked-examples-aversion signal — they might just be
  unfamiliar with the underlying concept. Mitigation: the
  `evidenceCount` field accumulates over many sessions, so the
  long-term average smooths out individual-session noise. Routing
  consumers should weight preference by `evidenceCount` (ignore
  preferences with <5 evidence as still-noisy). Documented for the
  routing-integration design.
- **Lesson `suggestedStrategy` is the tutor's recommendation, not what
  the tutor actually used.** A teach-mode tutor that ignores the
  strategy field still has its outcome attributed to that strategy.
  Mitigation: in practice the tutor's prompt fragment honors
  `suggestedStrategy` (it's part of the lesson context). When the
  metacognitive-prompts feature lands, it can wire the strategy hint
  into more places. Long-term fix is the LLM-based strategy detection.
- **Pack version drift.** A pack upgrade that renames or removes a
  strategy id leaves orphaned `proceduralStrategies` rows for the old
  id. The validation step in the indexer skips writes to unknown
  strategies, but historical rows persist. v1 doesn't migrate them; a
  future "pack-migration" feature can.

## Implementation summary (2026-05-10)

Single child story landed at `stage: review`:

- `epic-phase-18-procedural-memory-indexer` (`8048577`) —
  `ProceduralIndexer` (session-end, deterministic heuristic) +
  `scoreSessionOutcome` pure helper + real `MemoryService.procedural()`
  + services-wiring + 30 tests (23 indexer + 7 read-path).

Cross-cutting deviations:
- Test arrays declared as `IndexerContext["events"][number][]` (mutable
  element array) rather than the readonly version, so `.push()` works
  in test setup. Pragmatic; doesn't leak to production.
- A follow-up `lint:fix` commit (`fc21414`) auto-organized imports and
  did minor whitespace cleanup on the agent's four touched files. Lint
  count flat at 4 errors (baseline).

Verification at `fc21414`:
- `pnpm typecheck` clean (all 10 packages)
- `pnpm --filter @praxis/core test` 611 passed (64 files)
- `pnpm lint` 4 errors (baseline; zero new)

What's now possible:
- `MemoryService.procedural(studentId)` returns real strategy
  preferences with `evidenceCount` instead of the Phase 14 stub's
  empty Map.
- Strategy preferences accumulate over sessions: positive outcomes
  nudge preference up by `correct * 50` milli (capped at +300/session);
  negative outcomes nudge down 2× as fast (loss aversion).
- `epic-phase-18-routing-integration` is now fully unblocked: both
  procedural and affective projections have real data flowing into
  them. Phase 18's closing piece can land next.

Stage: implementing → review.

## Review (2026-05-10)

**Verdict**: Approve

**Blockers**: none
**Important**: none

The single child story `epic-phase-18-procedural-memory-indexer` landed at
done with its own Approve verdict. The feature delivers the capability the
brief promised end-to-end:

- `MemoryService.procedural(studentId)` returns real strategy preferences
  (replacing the Phase 14 stub) ✅
- `ProceduralIndexer` runs at session-end, attributes outcome to
  `lesson.suggestedStrategy`, validates against the pedagogy pack, applies
  loss-aversion-asymmetric delta with per-session and hard bounds ✅
- Wired into `IndexerOrchestratorImpl` alongside mastery / misconception /
  affective / concept-map indexers ✅
- 30 new tests across 2 files (23 indexer + 7 read-path) — all green ✅

Aggregate lenses:

- **Design alignment**: Single-story decomposition was right — fit cleanly
  in one stride. Implementation matches the design exactly, including the
  reject-don't-write semantics on net=0 sessions and unknown strategies.
- **Foundation-doc alignment**: `docs/CONTRACT.md:881` already declared
  `MemoryService.procedural(): Promise<ProceduralModel>`; this feature
  closes the Phase 14 stub gap. `docs/CURRICULUM.md`'s assertion about
  procedural memory's role as a routing input is honored — the
  projection now has real data to feed `routing-integration`. No drift.
- **Breaking changes**: none. `ProceduralModel` shape is unchanged from
  the prior stub return; only the contents went from "always empty" to
  "real preferences".
- **Capability completeness**: every brief line resolves —
  `procedural()` real, indexer wired with deps (sessionCourseId +
  courseStateReader + pedagogyPack), tests cover all enumerated cases.

Three nits captured in the story review (in conversation only):
- Loose `event.result.value` cast (mirrors affective-indexer pattern)
- `code_sandbox` null-exit edge case (rare; documented)
- Tool-name string literals could be hoisted to constants

**Verification at HEAD** (`ba25f60`): `pnpm typecheck` clean;
`pnpm --filter @praxis/core test` 611 passed (64 files); `pnpm lint`
4 errors (unchanged baseline; zero new from this feature).

What's now possible: `epic-phase-18-routing-integration` is now FULLY
unblocked — both procedural and affective memory have real data flowing
into them. The closing piece of Phase 18 (router consumption of
strategy preferences and affective signals) can land next.

Stage: review → done.
