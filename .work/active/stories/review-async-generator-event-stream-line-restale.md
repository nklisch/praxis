---
id: review-async-generator-event-stream-line-restale
kind: story
stage: implementing
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: review
created: 2026-05-23
updated: 2026-05-23
---

# Pattern skill `async-generator-event-stream` cites stale `session-service.ts:166` for `send`

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/async-generator-event-stream.md:15`
- Code: `packages/core/src/services/session-service.ts:177`

## Current doc text
> **File**: `packages/core/src/services/session-service.ts:166`

## Reality
After the SessionPromoter extraction (commit `2531546`), `SessionServiceImpl.send` moved from line 166 to line 177. The citation is now stale again.

## Required edit
Change the file:line citation on line 15 of `.claude/skills/patterns/async-generator-event-stream.md` from:
`packages/core/src/services/session-service.ts:166`
to:
`packages/core/src/services/session-service.ts:177`

Verify with `grep -n "async \*send" packages/core/src/services/session-service.ts` before committing.
