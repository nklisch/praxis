---
id: feature-phase-2-engine-layer
kind: feature
stage: done
tags: []
parent: null
depends_on: [feature-phase-1-foundation]
release_binding: v0
gate_origin: null
created: 2026-05-09
updated: 2026-05-09
---

# Phase 2 — Engine layer + vertical-slice backend

Retro-released into v0 on 2026-05-09. Original design: `docs/designs/phase-2-engine-layer.md`.

**Goal that shipped:** A Node script can run a full tutor session end-to-end against any of the three engines (Claude Code, Codex, Direct); transcript persists.

**Notes:** Established the `Engine` / `EngineSession` / `EngineEvent` contract and three adapters under `packages/engines/`. Tool-dispatch shell + episodic event stream landed alongside.
