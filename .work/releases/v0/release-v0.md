---
id: release-v0
kind: release
stage: released
tags: []
parent: null
depends_on: []
release_binding: v0
gate_origin: null
created: 2026-05-09
updated: 2026-05-09
---

# Release v0 — Pre-substrate retrospective bundle

Synthesized on 2026-05-09 by `/agile-workflow:convert` to preserve continuity for all
work shipped before the agile-workflow substrate was bootstrapped.

This is **not a real shipped release.** No `v0` git tag exists; no installer was
distributed. The bundle's only purpose is to give every pre-bootstrap design a home
in the substrate's release tier so future releases (v0.x, v1.0) can declare
`depends_on:` against shipped phases without dangling references.

## Bundle contents

**Phases (1–17):**
- feature-phase-1-foundation
- feature-phase-2-engine-layer
- feature-phase-3-ui-shell
- feature-phase-4-verification-tools
- feature-phase-5-textbook-rag
- feature-phase-6-course-lesson-bootstrap
- feature-phase-7-adaptive-memory
- feature-phase-8-multi-mode-assessment
- feature-phase-9-gates-progress-map
- feature-phase-10-knowledge-graph-canonical-pack
- feature-phase-11-configure-mode-authoring
- feature-phase-12-workspace-notes-flashcards
- feature-phase-13-editorial-foundation
- feature-phase-14-tabs-and-library
- feature-phase-15a-sketch-foundation
- feature-phase-15b-concept-map
- feature-phase-16a-bootstrap-explorer
- feature-phase-16b-modalities-and-assessment-loop
- feature-phase-17-item-types-and-quick-checks

**Non-phase chunks:**
- feature-activity-rail
- feature-language-sandbox-registry
- feature-claude-auth
- feature-structured-logging-observability

## Source preservation

All original design documents remain in `docs/designs/` untouched. Foundation docs
(`docs/VISION.md`, `SPEC.md`, `ARCHITECTURE.md`, `CONTRACT.md`, `UX.md`,
`CURRICULUM.md`, `ROADMAP.md`) are preserved as the single source of truth for
"how the system works now."

## Why `v0` and not "v1"

The first real shipped release is targeted at Phase 19 (Biology canonical + Electron
packaging + ship). That milestone will tag `v1.0.0`. Calling this retro bundle
`v0` keeps the namespace clean for the actual ship.
