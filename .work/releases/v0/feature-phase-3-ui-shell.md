---
id: feature-phase-3-ui-shell
kind: feature
stage: done
tags: [ui]
parent: null
depends_on: [feature-phase-2-engine-layer]
release_binding: v0
gate_origin: null
created: 2026-05-09
updated: 2026-05-09
---

# Phase 3 — UI shell + IPC transport + chat

Retro-released into v0 on 2026-05-09. Original design: `docs/designs/phase-3-ui-shell.md`.

**Goal that shipped:** Open the Electron dev app, type to a tutor, see streamed responses. M1 milestone.

**Notes:** Electron host + IPC transport (server in core, client in `@praxis/client`); React + TanStack Router shell with streaming chat surface.
