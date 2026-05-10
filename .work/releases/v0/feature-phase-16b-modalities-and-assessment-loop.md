---
id: feature-phase-16b-modalities-and-assessment-loop
kind: feature
stage: done
tags: [content, ui]
parent: null
depends_on: [feature-phase-16a-bootstrap-explorer]
release_binding: v0
gate_origin: null
created: 2026-05-09
updated: 2026-05-09
---

# Phase 16b — Modalities per mode + assessment loop

Retro-released into v0 on 2026-05-09. Original design: `docs/designs/phase-16-modalities-and-assessment-loop.md`.

**Goal that shipped:** Each mode has its own embodied UI shape inside its tab. The teach-mode tutor can author assignments that spawn child sessions; when the student submits, the tutor is notified and narrates feedback.

**Notes:** Per-mode tab bodies (`QuizTabBody`, `HomeworkTabBody`, `ExamTabBody`, `BootstrapTabBody`); `SessionService.spawnFromAssignment()` + `notifySession()` parent-child linkage; `parent_session_id` on sessions and assignments tables.
