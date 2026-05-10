---
id: gate-docs-pattern-episodic-append-line
kind: story
stage: review
tags: [documentation]
parent: feature-release-v0.1.0-doc-findings
depends_on: []
release_binding: v0.1.0
gate_origin: docs
created: 2026-05-10
updated: 2026-05-10
---

# Pattern `episodic-append-ordering.md` cites stale `session-service.ts:139`

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/episodic-append-ordering.md:12`
- Code: `packages/core/src/services/session-service.ts:125` (`async *send`)

## Current doc text
> **File**: `packages/core/src/services/session-service.ts:139`

## Reality
The `async *send` reference is now at line 125. The `episodic.ts:19`
reference (Example 2) is still correct.

## Required edit
Update the citation to `packages/core/src/services/session-service.ts:125`.

## Implementation notes
Updated `session-service.ts:139` → `:125` in episodic-append-ordering.md Example 1. Verified: `async *send` is at line 125 in the current source. The `episodic.ts:19` reference (Example 2) was already accurate and left unchanged.
