---
id: gate-docs-readme-phase-counter
kind: story
stage: done
tags: [documentation]
parent: feature-release-v0.1.0-doc-findings
depends_on: []
release_binding: v0.1.0
gate_origin: docs
created: 2026-05-10
updated: 2026-05-10
---

# README.md "phases 1–16 shipped" — current is through Phase 19

## Drift category
readme-staleness

## Location
- Doc: `README.md:251`
- Code: n/a — phase progression evidenced by `.work/active/epics/`
  containing epic-phase-18-* and epic-phase-19-* items at stage:done,
  bound to v0.1.0.

## Current doc text
> - `docs/designs/` — per-phase implementation designs (phases 1–16 shipped)

## Reality
Phase 17 (item types + quick checks) shipped in the prior `v0` release.
Phase 18 (study-skills, affective + procedural indexers, coach mode,
metacognitive prompts, pedagogy pack service + content, routing
integration) and Phase 19 (auto-update, biology pack, electron signing,
first-run flow, onboarding docs, ship checklist) are bound to v0.1.0.

## Required edit
Update the line to "phases 1–19 shipped" — or, more durably, drop the
trailing parenthetical and just say "per-phase implementation designs
(historical artifacts; new design lives in `.work/active/features/<id>.md`
bodies per the rolling-foundation principle)" matching the wording in
CLAUDE.md.

## Implementation notes
Applied the durable wording: replaced `(phases 1–16 shipped)` with
`(historical artifacts; new design lives in .work/active/features/<id>.md
bodies per the rolling-foundation principle)` at `README.md:251`. This
avoids the counter going stale again.

## Review (2026-05-10)

Durable wording is the right call — removing the counter eliminates the entire class of staleness. The new text correctly describes how design now lives in the substrate rather than in `docs/designs/`. Approve.
