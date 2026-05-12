---
id: gate-docs-contract-engine-session-send-signal
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
