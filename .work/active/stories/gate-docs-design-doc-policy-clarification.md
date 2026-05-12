---
id: gate-docs-design-doc-policy-clarification
kind: story
stage: drafting
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: docs
created: 2026-05-12
updated: 2026-05-12
---

# No `docs/designs/` doc exists for the four substrate-driven features that landed in v0.1.1

## Drift category
design-doc-gap

## Location
- Doc: `docs/designs/` (no `epic-bootstrap-readiness*.md`, `feature-agent-transparency-ux*.md`, `feature-prompt-customization-layers*.md`, `epic-v1-security-hardening*.md`); also `CLAUDE.md` "New design docs go in `docs/designs/phase-NN-*.md`"
- Code: Substrate items at `.work/active/epics/epic-bootstrap-readiness.md`, `.work/active/features/feature-agent-transparency-ux.md`, `.work/active/features/feature-prompt-customization-layers.md`, `.work/archive/epic-v1-security-hardening.md` carry their designs in the item bodies.

## Current doc text
(CLAUDE.md "Phase map" paragraph) — "New design docs go in `docs/designs/phase-NN-*.md`; refactor plans in `docs/refactors/`."

## Reality
All four features/epics carry their design INSIDE the substrate item bodies per the rolling-foundation principle ("Item-IS-the-Work"). No separate `docs/designs/*.md` was created for any of them. The existing `docs/designs/` directory holds Phase 1–17 + activity-rail / claude-auth / claude-cli-sdk-refactor / language-sandbox-registry / bootstrap-explorer — i.e., earlier work only.

## Required edit
Pick one and apply:
- (a) Update CLAUDE.md's "New design docs go in `docs/designs/phase-NN-*.md`" line to clarify that design docs are **optional** and only used for major phase work — feature- and epic-level designs live in the substrate item body per the Item-IS-the-Work principle.
- (b) Backfill condensed design notes for these four substrate-driven features into `docs/designs/` to maintain symmetry with earlier phases.

Recommend (a) — aligns with rolling-foundation. Owner judgment.
