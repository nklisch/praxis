---
id: gate-docs-architecture-indexer-deterministic-flavor
kind: story
stage: implementing
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.0
gate_origin: docs
created: 2026-05-10
updated: 2026-05-10
---

# ARCHITECTURE.md indexer description claims all indexers are "themselves agents — prompt-driven"

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/ARCHITECTURE.md:286`
- Code: `packages/core/src/services/indexers/procedural-indexer.ts:8` and
  `packages/core/src/services/indexers/mastery-indexer.ts`

## Current doc text
> **Indexer agents** are themselves agents — small, narrow-purpose,
> prompt-driven — that read recent episodic events and write projection
> updates.

## Reality
Two of the five indexers are now purely deterministic — no LLM call.
`procedural-indexer.ts:8` explicitly states "Heuristic v1 — deterministic,
no LLM call." `mastery-indexer.ts` is also deterministic (BKT updates
from event signals). Only `misconception-indexer`,
`concept-map-divergence-indexer`, and the model-inferred path of
`affective-indexer` are LLM-driven. The blanket "themselves agents —
prompt-driven" assertion is no longer true for the projection family as
a whole.

## Required edit
Replace the assertion with a description that distinguishes the two
flavors: deterministic indexers (mastery, procedural) compute projections
from explicit event signals; LLM-driven indexers (misconception,
affective model-inferred path, concept-map divergence) call a one-shot
model. Both run debounced after each session turn (or on session end),
are non-fatal on failure, and are regenerable from episodic.
