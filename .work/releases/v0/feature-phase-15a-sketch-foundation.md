---
id: feature-phase-15a-sketch-foundation
kind: feature
stage: done
tags: [ui]
parent: null
depends_on: [feature-phase-14-tabs-and-library]
release_binding: v0
gate_origin: null
created: 2026-05-09
updated: 2026-05-09
---

# Phase 15a — Sketch foundation (tldraw)

Retro-released into v0 on 2026-05-09. Original design: `docs/designs/phase-15a-sketch-foundation.md`.

**Goal that shipped:** Stylus-friendly sketching everywhere typing is allowed. Foundation primitive that Phase 16's modality bodies depend on.

**Notes:** `<SketchCanvas>` + composer-sketch + note-editor-sketch surfaces backed by tldraw. Sketches stored as JSON + image; tutor reads both.
