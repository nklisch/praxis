---
id: gate-docs-pattern-episodic-append-ordering-line-followup
kind: story
stage: implementing
tags: [docs]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: docs
created: 2026-05-23
updated: 2026-05-23
---

# Pattern skill `episodic-append-ordering` cites stale `session-service.ts:166`

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/episodic-append-ordering.md:12`
- Code: `packages/core/src/services/session-service.ts:177`

## Current doc text
> **File**: `packages/core/src/services/session-service.ts:166`

## Reality
Commit `2531546` (story-refactor-session-service-extract-promoter) added the
`SessionPromoter` lazy-promote block inside `SessionServiceImpl`, shifting
`send()` from line 166 to line 177. The previous fix (`ae96ced`) had correctly
updated `:125` → `:166`, but the subsequent refactor landed after that fix.

## Required edit
Change `.claude/skills/patterns/episodic-append-ordering.md` line 12 citation from
`:166` to `:177`.
