---
id: epic-phase-18-study-skills
kind: epic
stage: drafting
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

## Next step

Run `/agile-workflow:design` to expand this epic into a feature-level decomposition.
The design will:

1. Read `docs/ROADMAP.md`, `docs/CURRICULUM.md`, and `docs/CONTRACT.md` to ground in
   how memory layers and modes compose today.
2. Decide whether the metacognition coach is its own mode or a sub-mode of teach.
3. Decompose into child features with `depends_on:` declared (likely procedural
   memory first, then affective memory, then the coach mode that consumes both).
