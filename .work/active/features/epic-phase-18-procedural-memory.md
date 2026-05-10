---
id: epic-phase-18-procedural-memory
kind: feature
stage: drafting
tags: [content]
parent: epic-phase-18-study-skills
depends_on: [epic-phase-18-pedagogy-pack]
release_binding: null
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
