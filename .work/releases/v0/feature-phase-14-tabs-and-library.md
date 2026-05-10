---
id: feature-phase-14-tabs-and-library
kind: feature
stage: done
tags: [ui]
parent: null
depends_on: [feature-phase-13-editorial-foundation]
release_binding: v0
gate_origin: null
created: 2026-05-09
updated: 2026-05-09
---

# Phase 14 — Tabs + Library

Retro-released into v0 on 2026-05-09. Original design: `docs/designs/phase-14-tabs-and-library.md`.

**Goal that shipped:** Multiple sessions of any mode run as parallel tabs in the chat workspace; a single Library replaces the courses / packs / documents trinity as the front door. Sessions become named arcs you can leave and come back to.

**Notes:** `useTabs()` hook + tab-body-isolation pattern (`display:none` for inactive tabs to preserve in-flight streams). Library route consolidates all artifact surfaces.
