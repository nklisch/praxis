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

## Collapsed items

All 23 bound items collapsed here under `delete-refs`; full bodies live in git history (`git show <git_ref>:<path>`).

| id | title | kind | archived_atop | git_ref |
| --- | --- | --- | --- | --- |
| feature-activity-rail | Activity rail — ambient progress for long-running work | feature | — | 56893d17 |
| feature-claude-auth | Claude CLI authentication | feature | — | 56893d17 |
| feature-language-sandbox-registry | Language sandbox registry — QuickJS replaces isolated-vm | feature | — | 56893d17 |
| feature-phase-1-foundation | Phase 1 — Foundation skeleton | feature | — | 56893d17 |
| feature-phase-10-knowledge-graph-canonical-pack | Phase 10 — Knowledge graph + canonical math pack | feature | — | 56893d17 |
| feature-phase-11-configure-mode-authoring | Phase 11 — Configure mode + lock + authoring UI | feature | — | 56893d17 |
| feature-phase-12-workspace-notes-flashcards | Phase 12 — Workspace + notes + flashcards | feature | — | 56893d17 |
| feature-phase-13-editorial-foundation | Phase 13 — Editorial foundation | feature | — | 56893d17 |
| feature-phase-14-tabs-and-library | Phase 14 — Tabs + Library | feature | — | 56893d17 |
| feature-phase-15a-sketch-foundation | Phase 15a — Sketch foundation (tldraw) | feature | — | 56893d17 |
| feature-phase-15b-concept-map | Phase 15b — Concept map | feature | — | 56893d17 |
| feature-phase-16a-bootstrap-explorer | Phase 16a — Bootstrap explorer + course-scoped documents | feature | — | 56893d17 |
| feature-phase-16b-modalities-and-assessment-loop | Phase 16b — Modalities per mode + assessment loop | feature | — | 56893d17 |
| feature-phase-17-item-types-and-quick-checks | Phase 17 — Item type expansion + inline quick checks | feature | — | 56893d17 |
| feature-phase-2-engine-layer | Phase 2 — Engine layer + vertical-slice backend | feature | — | 56893d17 |
| feature-phase-3-ui-shell | Phase 3 — UI shell + IPC transport + chat | feature | — | 56893d17 |
| feature-phase-4-verification-tools | Phase 4 — Verification tools (math + code) | feature | — | 56893d17 |
| feature-phase-5-textbook-rag | Phase 5 — Document RAG (multi-format ingestion + vision) | feature | — | 56893d17 |
| feature-phase-6-course-lesson-bootstrap | Phase 6 — Course + lesson + bootstrap | feature | — | 56893d17 |
| feature-phase-7-adaptive-memory | Phase 7 — Adaptive memory (semantic + misconception) | feature | — | 56893d17 |
| feature-phase-8-multi-mode-assessment | Phase 8 — Multi-mode + assessment | feature | — | 56893d17 |
| feature-phase-9-gates-progress-map | Phase 9 — Gates + progress map | feature | — | 56893d17 |
| feature-structured-logging-observability | Structured logging & observability | feature | — | 56893d17 |

