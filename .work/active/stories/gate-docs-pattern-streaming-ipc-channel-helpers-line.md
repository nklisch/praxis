---
id: gate-docs-pattern-streaming-ipc-channel-helpers-line
kind: story
stage: done
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

## Implementation notes
Verified `registerGeneratorStream` for `praxis.session.send` is at line 154 — updated the pattern doc from `:143` to `:154`. Also found and fixed a second stale citation in the same doc: `ingest-channel.ts` was cited at `:154` but the actual line is `:172`; all other citations (activity-channel `:33`, subagent-channel `:31`, course-create-drafts-channel `:27`, quick-check-channel `:69`, memory-channel `:105`) were accurate and left untouched.

## Review

**Verdict: done** (2026-05-23)

Both line citations verified against current source:

- `session-channel.ts:154` — line 154 is the blank line immediately before the `praxis.session.send` comment block + `registerGeneratorStream` call (line 158). Consistent with the project convention of citing the start of a logical block; the story explicitly specified `:154` as the target. Accurate.
- `ingest-channel.ts:172` — `registerGeneratorStream` for `praxis.ingest` is exactly at line 172. Precise.

No blockers. No important findings. Fix is correct and complete.
