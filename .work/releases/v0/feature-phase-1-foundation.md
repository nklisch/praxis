---
id: feature-phase-1-foundation
kind: feature
stage: done
tags: []
parent: null
depends_on: []
release_binding: v0
gate_origin: null
created: 2026-05-09
updated: 2026-05-09
---

# Phase 1 — Foundation skeleton

Retro-released into v0 on 2026-05-09. Original design: `docs/designs/phase-1-foundation.md`.

**Goal that shipped:** A working pnpm monorepo with shared types, storage schema, and CI green on hello-world.

**Notes:** Established the `@praxis/*` workspace, Drizzle SQLite schema for v1 tables, migration tooling, and the test/lint baseline. All later phases depend on this skeleton.
