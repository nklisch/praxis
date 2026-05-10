---
id: epic-phase-18-affective-memory
kind: feature
stage: drafting
tags: [content]
parent: epic-phase-18-study-skills
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Affective memory — indexer + read path + check-in surface

## Brief

Affective memory captures engagement / frustration / confidence patterns —
sampled both passively from transcripts (model-inferred) and actively via
explicit student check-ins. The schema already exists (`affective_samples`
table with `engagementMilli`, `frustrationMilli`, `confidenceMilli` columns
and a `source: "model-inferred" | "explicit-checkin"` discriminator). The
query path is a stub (`memory-service.ts:139`, `Phase 14 stub`).

What this delivers:

- Replace the affective stub: real query that returns the recent `N` samples
  plus rolling baselines for the three signals.
- New `AffectiveIndexer` agent in `packages/core/src/services/indexers/` —
  follows the existing pattern. Reads recent episodic transcripts and emits
  one sample per session-window with `source: "model-inferred"`. Uses
  cheap-tier model calls (cost matters; this fires post every session).
- Explicit check-in path: the existing `quick_check.confidence` tool (Phase
  17) already records a confidence rating from the student. This feature
  routes that rating through the affective table with
  `source: "explicit-checkin"`. (The tool itself doesn't change shape; the
  pipe to the affective table is what's added.)
- Wire the indexer into `IndexerOrchestrator` post-session.
- Tests: read-path round-trip, indexer golden cases (frustrated transcript
  → high frustration sample), check-in pipe verified end-to-end.

What this feature does NOT cover: routing logic that *uses* affective
signals (frustration → drop difficulty) — that's
`epic-phase-18-routing-integration`. UI affordance for surfacing affective
state to the student or configurator is also out of scope; configurable
visibility belongs to the inspector views built later.

## Epic context

- Parent epic: `epic-phase-18-study-skills`
- Position in epic: parallel sibling to `procedural-memory`; both feed the
  routing-integration feature downstream. Independent of the pedagogy pack
  — affective signals don't reference strategy ids.

## Foundation references

- `docs/CONTRACT.md` — `AffectiveModel` / `AffectSample` shapes (line ~696),
  `MemoryService.affective()` (line ~882)
- `docs/ARCHITECTURE.md` — "Affective captures engagement, frustration, and
  confidence patterns" (line ~282), Indexer agents section
- `docs/CURRICULUM.md` — adaptive routing's affective inputs
- `docs/ROADMAP.md` Phase 17 — `quick_check.confidence` is the existing
  check-in surface this feature plumbs through
