---
id: gate-docs-contract-tool-context-call-id
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

# CONTRACT.md `ToolContext` interface omits `callId?: string` field

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/CONTRACT.md:219-231`
- Code: `packages/core/src/types/tool.ts:123-130`

## Current doc text
> "interface ToolContext { studentId: StudentId; sessionId: SessionId; services: {...}; log: Logger; }"

## Reality
`ToolContext` includes `callId?: string` (set by `InProcessToolRegistry.dispatch` when the engine adapter supplies a callId via `meta`). Sub-agent-emitting tools use this to key their events to the parent's `tool_call`.

## Required edit
Add `callId?: string` to the `ToolContext` interface with a short comment explaining that it carries the parent `tool_call`'s callId for sub-agent-emitting handlers.
