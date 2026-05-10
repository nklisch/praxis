---
id: gate-docs-pattern-ipc-channel-convention-line
kind: story
stage: implementing
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.0
gate_origin: docs
created: 2026-05-10
updated: 2026-05-10
---

# Pattern `ipc-channel-convention.md` cites stale `ipc-server.ts:29`

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/ipc-channel-convention.md:12`
- Code: `packages/desktop/electron/main/ipc-server.ts:81`
  (first `handle("praxis.session.active"`)

## Current doc text
> **File**: `packages/desktop/electron/main/ipc-server.ts:29`

## Required edit
Update citation to `packages/desktop/electron/main/ipc-server.ts:81` (or
remove the line cite and reference the `registerSessionHandlers` block
more loosely — it's a more durable reference).
