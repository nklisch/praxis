---
id: epic-phase-18-study-skills
kind: epic
stage: implementing
tags: [content]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-09
updated: 2026-05-10
---

# Phase 18 — Study-skills + pedagogy pack + remaining memory

Source: `docs/ROADMAP.md` Phase 18 (not yet started).

**Goal:** Dedicated metacognition coach mode plus the procedural / affective memory
it relies on.

## What ROADMAP says

- New `coach` mode (or equivalent metacognition role) wired into the mode registry,
  with its own prompt fragments and tool scope.
- Procedural memory projection (skill / strategy traces) joining the existing
  semantic + misconception layers from Phase 7.
- Affective memory projection (engagement / frustration / confidence signals) — the
  fourth layer originally scoped in Phase 7 and deferred.
- Study-skills pedagogy pack: canonical metacognitive concepts + routing logic that
  surfaces them when the relevant signals fire.

## Status

`stage: drafting` — no design doc yet. Phase 17 is shipped; Phases 1-17 are bound
to the retro-release `v0`, so this epic has no active dependencies (terminal-done).

## Decomposition

Split by capability arc, with the pedagogy pack as the foundation that the
two consumer features (cross-mode prompts + coach mode) and one indexer
(procedural — strategy ids must exist) all depend on. The two memory
indexers are parallelizable; the routing-integration feature consumes both
and lands last to close the loop the ROADMAP test checkpoint asks for.

Sized for 5-12 implementation units each. Tags propagate `[content]` from
the epic; no `[refactor]` or `[perf]` because the work is greenfield.

The metacognition coach question (sub-mode of teach vs its own mode) is
resolved by `docs/CURRICULUM.md` — the coach has its own dedicated mode
(`study-skills`) AND its voice is woven through the other modes via prompt
fragments. Both paths are real; this decomposition gives each its own
feature.

### Child features

- `epic-phase-18-pedagogy-pack` — `PedagogyPackService` + v1 pack content
  (strategies, techniques, metacognitive prompts, citations); read-only
  `pedagogy.*` tools — depends on: `[]`
- `epic-phase-18-procedural-memory` — `ProceduralIndexer` + real
  `MemoryService.procedural()` (replace Phase 14 stub) — depends on:
  `[epic-phase-18-pedagogy-pack]`
- `epic-phase-18-affective-memory` — `AffectiveIndexer` + real
  `MemoryService.affective()` + plumb `quick_check.confidence` into the
  affective table as `source: "explicit-checkin"` — depends on: `[]`
- `epic-phase-18-metacognitive-prompts` — cross-mode prompt fragment that
  injects metacognitive prompts at pre-reading / post-error / session-end /
  pre-quiz triggers; coach voice attribution — depends on:
  `[epic-phase-18-pedagogy-pack]`
- `epic-phase-18-coach-mode` — dedicated `study-skills` mode, role +
  tools + light visual treatment; mode-registry registration — depends on:
  `[epic-phase-18-pedagogy-pack]`
- `epic-phase-18-routing-integration` — extend `suggestNext` router to read
  procedural / affective; strategy selection by preference; frustration →
  difficulty drop; persistent-misconception → study-skills suggestion —
  depends on: `[epic-phase-18-procedural-memory, epic-phase-18-affective-memory]`

### Decomposition risks

- **Pedagogy pack content authoring is research-heavy.** v1 needs faithful
  citations of primary learning-science sources (Bjork on retrieval
  practice, Sweller on cognitive load, etc.). Allocate non-trivial author
  time inside the pack feature, not as a follow-on.
- **Affective indexer relies on model-inferred sentiment from transcripts.**
  Quality of those inferences is the floor for routing usefulness in the
  routing-integration feature. If the affective indexer ships with weak
  signal, the difficulty-drop behaviour will feel arbitrary. The feature's
  test checkpoint should include adversarial cases (a frustrated transcript
  the indexer should classify as such).
- **Coach voice / visual treatment is soft-specced.** "Light visual
  treatment" risks scope creep into a re-themed surface. The coach-mode
  feature's design pass needs to pin a concrete affordance (header chip
  copy + colour token) and not let it drift.
