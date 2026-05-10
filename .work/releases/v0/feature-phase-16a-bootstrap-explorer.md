---
id: feature-phase-16a-bootstrap-explorer
kind: feature
stage: done
tags: [content]
parent: null
depends_on: [feature-phase-15b-concept-map]
release_binding: v0
gate_origin: null
created: 2026-05-09
updated: 2026-05-09
---

# Phase 16a — Bootstrap explorer + course-scoped documents

Retro-released into v0 on 2026-05-09. Original design: `docs/designs/phase-16-bootstrap-explorer.md`.

**Goal that shipped:** Replace the single-shot `course.propose_draft` with an agentic multi-turn exploration loop. The bootstrap agent reads uploaded materials deeply and produces a richer draft with units, lessons, and assessment shells.

**Notes:** `course.start_exploration` + `course.draft_add_unit` / `draft_set_assessment_plan` / `draft_add_lesson_assessment` tools. `BootstrapServiceImpl.persistDraft` materialises units + lessons + assessment shells in one transaction. `course_documents` join table scopes which documents an exploration session reads.
