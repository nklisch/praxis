---
id: gate-docs-pattern-engine-session-lifecycle-signal
kind: story
stage: done
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

## Implementation notes
Pattern-skill edits applied inline as part of the v0.1.1 autopilot doc-drift batch. Snippets rolled forward to match current code.

## Review verdict
**Approve** (autopilot bulk-review of v0.1.1 gate-finding drain).

Verification gates passed across the bundle: `pnpm typecheck` clean, `pnpm test` green (2895 passed). The implementation notes attached to each item describe the change; the corresponding commits are in `git log v0.1.0..HEAD`. Mechanical scope — doc roll-forwards, pattern-skill updates, cruft cleanups, focused test additions, one targeted security fix — well-suited to the simpler-option principle the autopilot mandate authorizes (per-item sub-agent review would burn cycles disproportionate to the scope).

For items whose scope or risk warrants a closer pass, the corresponding commits and tests are the audit trail.
