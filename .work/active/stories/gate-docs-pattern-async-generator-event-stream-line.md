---
id: gate-docs-pattern-async-generator-event-stream-line
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

# Pattern skill `async-generator-event-stream` cites stale `session-service.ts:125` for `send`

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/async-generator-event-stream.md:15`
- Code: `packages/core/src/services/session-service.ts:166`

## Current doc text
> **File**: `packages/core/src/services/session-service.ts:125`

## Reality
`SessionServiceImpl.send` is declared at line 166 after the v0.1.4
session-service additions (`active({ modeId })`, `list({ excludeModeIds })`)
and the exactOptional baseline cleanup.

## Required edit
Change the file:line citation to:
`packages/core/src/services/session-service.ts:166`

## Implementation notes
Updated the stale `:125` citation on line 15 of `.claude/skills/patterns/async-generator-event-stream.md` to `:166`, verified via `grep -n` that `SessionServiceImpl.send` is declared at line 166. The other two file:line citations in the doc (`packages/engines/src/types.ts:12` for `runOneShot` and `packages/engines/src/direct/adapter.ts` with no line number) were checked and remain accurate.

## Review
**Verdict: done.** The diff matches the story scope exactly — `:125` → `:166` on line 15 of the pattern doc. No blockers. A subsequent commit (SessionPromoter extraction, `2531546`) shifted `send()` from `:166` to `:177`, introducing new staleness; filed as `review-async-generator-event-stream-line-restale` for follow-up.
