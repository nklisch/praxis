---
id: epic-phase-18-affective-memory
kind: feature
stage: implementing
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

## Design decisions

- **Schedule: session-end, not post-turn.** Affect doesn't need real-time
  precision; per-session granularity is enough, and a one-shot LLM call
  per turn is too expensive. Mirrors `MisconceptionIndexer`.
- **One indexer covers both paths.** The `AffectiveIndexer` walks the
  session's events for `quick_check.confidence` tool_result pairs (writes
  `source: "explicit-checkin"` rows) AND runs a one-shot LLM over the
  transcript (writes one `source: "model-inferred"` row) in a single
  transaction. Single writer = atomicity for free; no separate
  `recordAffectCheckin` service method needed. The `quick_check.confidence`
  tool stays stateless.
- **Confidence rating → `[0, 1]` via linear mapping** `(rating - 1) /
  (max - 1)`. `max` is 4 for the default `1-4` scale and 5 for the optional
  `1-5` scale; recovered from the original `tool_call` args. Default to 4
  if scale not recoverable.
- **Explicit-checkin `engagement` / `frustration` default to 0.5** — the
  schema requires all three fields; `quick_check.confidence` only carries
  the confidence rating, so the other two are imputed neutral. They aren't
  used for routing decisions on explicit-checkin samples (the routing
  layer can filter by `source` if it wants to ignore imputed neutrals).
- **Read-path defaults**: `recent` returns the last 20 samples
  (descending by `ts`); `baseline` averages the last 50 samples.
  Empty-state baseline returns the previous Phase 14 stub default
  (`{0.5, 0.5, 0.5}`) so existing callers don't see a behavior change.
- **Model failure is non-fatal.** A bad model response (parse error,
  schema mismatch, engine error) doesn't block explicit-checkin writes
  in the same pass. The indexer logs a warning and continues. This
  preserves user-supplied data even if the inference is unreliable.
- **Out-of-range model output**: reject (don't clamp). If the model
  returns an `engagement` of 1.5, the JSON parse fails Zod's
  `.min(0).max(1)` and the `runModelInference` returns `null`. Better to
  log + skip than to silently distort the signal.
- **Transcript truncation**: cap at 100k chars (~25k tokens), tail-keep
  (the most recent turns are the most diagnostic for affect — the start
  of a session is usually neutral). Same as misconception-indexer.

## Architectural choice

Single `AffectiveIndexer` running at session-end, doing both
explicit-checkin extraction and model-inferred analysis in one pass with
one DB transaction. Considered alternatives:

- **Two separate writers**: indexer for model-inferred + a service method
  `MemoryService.recordAffectCheckin(rating)` called by the confidence
  quick-check at resolution. Cleaner separation of concerns, but
  introduces a second write path and doesn't add capability — we already
  have the rating in the episodic stream.
- **Real-time post-turn indexing.** A cheap-tier model call after every
  turn would give finer-grained affect tracking. Rejected for v1: cost
  scales linearly with turns, the value over per-session granularity is
  unclear, and the misconception indexer's per-session pattern works
  well in practice.

The chosen shape mirrors `MisconceptionIndexer` exactly, including the
prompt file and the test pattern. Maximum reuse of conventions; minimum
new surface area.

## Implementation Order

One child story:

1. `epic-phase-18-affective-memory-indexer` (no deps) — implements the
   read path, the indexer, the prompt, services wiring, and tests in one
   stride. The whole feature is ~250 lines of TS + tests; the
   parallelization gain from splitting wouldn't repay the orchestration
   overhead.

## Risks

- **Model-inference quality.** Per the parent epic's pre-mortem, this is
  the headline risk: per-session sentiment inference from a transcript
  is genuinely hard. The few-shot examples in the prompt should include
  contrasting cases (a frustrated stalled session vs. a confident
  productive one) to anchor the scale. The downstream
  `epic-phase-18-routing-integration` feature can apply a confidence
  threshold (only act on samples whose source is `explicit-checkin` or
  whose `model-inferred` confidence — once we add a meta-confidence
  signal — exceeds a threshold) if early signal quality is poor.
- **Sample volume.** A user who runs many short sessions accumulates
  many samples. The 50-row baseline window caps how much the read path
  scans per call, but the table itself grows monotonically. Future
  pruning (drop rows older than N days) is a non-goal for v1; flagging
  for visibility.
- **Out-of-range rejections silently lose model signal.** The
  reject-don't-clamp policy is correct semantically but means a single
  format slip from the model loses the whole inferred sample. Mitigation:
  the explicit-checkin path (which doesn't depend on the model) remains
  intact. If reject rates climb in dev, tighten the prompt before
  switching to clamping.
