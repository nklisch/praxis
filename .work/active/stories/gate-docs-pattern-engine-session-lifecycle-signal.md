---
id: gate-docs-pattern-engine-session-lifecycle-signal
kind: story
stage: implementing
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: docs
created: 2026-05-12
updated: 2026-05-12
---

# Pattern skill `engine-session-lifecycle.md` Example 2 omits the `signal?: AbortSignal` parameter

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/engine-session-lifecycle.md:36`
- Code: `packages/engines/src/claude-code/adapter.ts:189`

## Current doc text
> "async *send(userMessage: string): AsyncIterable<EngineEvent> {"

## Reality
`async *send(userMessage: string, signal?: AbortSignal): AsyncIterable<EngineEvent>` in all three adapters. The same change is reflected in `EngineSession.send` in the engine type.

## Required edit
Update the Example 2 signature to include `signal?: AbortSignal` and add one sentence in the surrounding "Rationale" or a new "Cancellation" subsection noting that adapters wire the signal to the SDK's abort mechanism and that `SessionServiceImpl` synthesizes an `interrupted` event when the signal fires.
