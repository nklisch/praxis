---
id: feature-phase-13-editorial-foundation
kind: feature
stage: done
tags: [ui, refactor]
parent: null
depends_on: [feature-phase-12-workspace-notes-flashcards]
release_binding: v0
gate_origin: null
created: 2026-05-09
updated: 2026-05-09
---

# Phase 13 — Editorial foundation

Retro-released into v0 on 2026-05-09. Original design: `docs/designs/phase-13-editorial-foundation.md`.

**Goal that shipped:** The whole app speaks one editorial visual language; the chat composer invites tutor-shaped requests; streamed model output reads as deliberate writing rather than machine output. **No structural changes** — polish phase that establishes the design language all later phases inherit.

**Notes:** RouteHeader, LibrarySection, EmptyState, LoadingState, ErrorMessage primitives + COPY module + `composes: editorial from global;` CSS utility. Re-implementing rather than reusing these primitives is now a reviewable defect.
