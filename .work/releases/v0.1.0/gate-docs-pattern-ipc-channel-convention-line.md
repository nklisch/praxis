---
id: gate-docs-pattern-ipc-channel-convention-line
kind: story
stage: done
tags: [documentation]
parent: feature-release-v0.1.0-doc-findings
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

## Implementation notes
Updated `ipc-server.ts:29` → `:81` in ipc-channel-convention.md Example 1. Verified: the `handle("praxis.session.active", ...)` call (first session channel registration) is at line 81 in the current source. New line number confirmed correct.

## Review (2026-05-10)

Spot-checked: `grep -n 'handle.*praxis.session.active'` on ipc-server.ts confirms line 81. Citation accurate. Approve.
