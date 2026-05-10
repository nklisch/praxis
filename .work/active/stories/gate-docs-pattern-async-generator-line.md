---
id: gate-docs-pattern-async-generator-line
kind: story
stage: implementing
tags: [documentation]
parent: feature-release-v0.1.0-doc-findings
depends_on: []
release_binding: v0.1.0
gate_origin: docs
created: 2026-05-10
updated: 2026-05-10
---

# Pattern `async-generator-event-stream.md` cites stale `session-service.ts:91`

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/async-generator-event-stream.md:15` (and `:52`)
- Code: `packages/core/src/services/session-service.ts:125` (was :91)

## Current doc text
> **File**: `packages/core/src/services/session-service.ts:91`

## Reality
`async *send(sessionId: SessionId, message: string)` is now at
`session-service.ts:125` after the chat-surface refactor and intervening
changes. The `engines/src/types.ts:12` reference is still accurate.

## Required edit
Update the file:line citation to
`packages/core/src/services/session-service.ts:125`.
