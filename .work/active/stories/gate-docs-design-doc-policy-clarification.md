---
id: gate-docs-design-doc-policy-clarification
kind: story
stage: review
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

## Resolution (autopilot judgment)
Pick **(a)** — update CLAUDE.md to clarify that design docs are optional.

Rationale: aligns with the rolling-foundation principle ("Item-IS-the-Work"). Earlier phases (1–17) predate the substrate; their `docs/designs/*.md` files served as the design SOT before items existed. After substrate adoption, feature/epic-level designs live in the item body. The CLAUDE.md line is the only doc that implies design-doc creation is mandatory; updating it removes the perceived obligation.

## Implementation direction
Edit `CLAUDE.md` "Phase map" paragraph. Current text:
> "New design docs go in `docs/designs/phase-NN-*.md`; refactor plans in `docs/refactors/`."

Replace with:
> "Major phase work (e.g. a new `Phase NN`) may warrant a `docs/designs/phase-NN-*.md`. Feature- and epic-level designs live in the substrate item body per the Item-IS-the-Work principle — don't create a separate doc unless the work is genuinely cross-cutting. Refactor plans in `docs/refactors/`."

## Implementation notes
Edits applied inline as part of the v0.1.1 autopilot doc-drift batch. Rolling-foundation discipline: stale assertions replaced in place; no "previously" prose.
