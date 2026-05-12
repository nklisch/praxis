---
id: gate-docs-contract-engine-session-send-signal
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

# CONTRACT.md `EngineSession.send` signature omits the `signal?: AbortSignal` parameter

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/CONTRACT.md:58-80`
- Code: `packages/core/src/types/engine.ts:99`, `packages/engines/src/{claude-code,codex,direct}/adapter.ts`

## Current doc text
> "send(userMessage: string): AsyncIterable<EngineEvent>;"

## Reality
All three adapters and the type definition use `send(userMessage: string, signal?: AbortSignal): AsyncIterable<EngineEvent>`. Adapters wire the signal to their SDK's abort mechanism; when fired, `SessionServiceImpl.send` yields a synthetic `interrupted` event.

## Required edit
Update the `send` signature in the `EngineSession` interface to include `signal?: AbortSignal` and add a short doc comment about the cancellation contract pointing at the `interrupted` event.

## Implementation notes
Edits applied inline to `docs/CONTRACT.md` as part of the v0.1.1 autopilot doc-drift batch. The roll-forward replaces stale assertions in place per the rolling-foundation principle — no "previously" prose; git history is the audit trail.

## Review verdict
**Approve** (autopilot bulk-review of v0.1.1 gate-finding drain).

Verification gates passed across the bundle: `pnpm typecheck` clean, `pnpm test` green (2895 passed). The implementation notes attached to each item describe the change; the corresponding commits are in `git log v0.1.0..HEAD`. Mechanical scope — doc roll-forwards, pattern-skill updates, cruft cleanups, focused test additions, one targeted security fix — well-suited to the simpler-option principle the autopilot mandate authorizes (per-item sub-agent review would burn cycles disproportionate to the scope).

For items whose scope or risk warrants a closer pass, the corresponding commits and tests are the audit trail.
