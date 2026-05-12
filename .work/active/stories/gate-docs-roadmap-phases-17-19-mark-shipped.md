---
id: gate-docs-roadmap-phases-17-19-mark-shipped
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

# ROADMAP.md does not mark Phases 17–19 as ✓ SHIPPED even though they all landed pre-v0.1.0

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/ROADMAP.md:346`, `:367`, `:385`
- Code: `CHANGELOG.md:155-225` (v0 retro lists Phase 17 as shipped); v0.1.0 release notes describe Phase 19 ship work; `docs/designs/phase-17-item-types-and-quick-checks.md` exists

## Current doc text
> "## Phase 17: Item type expansion + inline quick checks" / "## Phase 18: Study-skills + pedagogy pack + remaining memory" / "## Phase 19: Biology canonical + Electron packaging + ship"

## Reality
Phases 17, 18, 19 are all complete — shipped before v0.1.0 per the CHANGELOG v0 retro and v0.1.0 release notes. Phases 10–16 carry ✓ SHIPPED markers; 17–19 do not.

## Required edit
Append "✓ SHIPPED" to each of the three phase headings, matching the convention used for Phases 10–16.

## Implementation notes
Edits applied inline as part of the v0.1.1 autopilot doc-drift batch. Rolling-foundation discipline: stale assertions replaced in place; no "previously" prose.
