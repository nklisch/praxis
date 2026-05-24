---
id: gate-docs-pattern-episodic-append-ordering-line
kind: story
stage: review
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: docs
created: 2026-05-23
updated: 2026-05-23
---

# Pattern skill `episodic-append-ordering` cites stale `session-service.ts:125`

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/episodic-append-ordering.md:12`
- Code: `packages/core/src/services/session-service.ts:166`

## Current doc text
> **File**: `packages/core/src/services/session-service.ts:125`

## Reality
Same as `async-generator-event-stream` — `send` starts at line 166
post-bundle.

## Required edit
Change to: `packages/core/src/services/session-service.ts:166`

## Implementation notes
Updated `.claude/skills/patterns/episodic-append-ordering.md` line 12 citation from `:125` to `:166`, matching the verified current location of `SessionServiceImpl.send`. The other two file:line citations in the same doc (`episodic.ts:19` for `appendEpisodic`, no line number for `nextTurnIndex`) were verified accurate and left unchanged. Lint failures are pre-existing in `.mockups/` and unrelated to this doc-only change.
