---
id: gate-docs-pattern-streaming-ipc-channel-helpers-line
kind: story
stage: implementing
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: docs
created: 2026-05-23
updated: 2026-05-23
---

# Pattern skill `streaming-ipc-channel-helpers` cites stale `session-channel.ts:143` for `praxis.session.send`

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/streaming-ipc-channel-helpers.md:72`
- Code: `packages/desktop/electron/main/session-channel.ts:154`

## Current doc text
> **File**: `packages/desktop/electron/main/session-channel.ts:143`

## Reality
`registerGeneratorStream` for `praxis.session.send` lives at line 154
after the new `sessionActiveSchema`, the `excludeModeIds` addition to
`sessionListSchema`, and surrounding ordering changes.

## Required edit
Change to: `packages/desktop/electron/main/session-channel.ts:154`
