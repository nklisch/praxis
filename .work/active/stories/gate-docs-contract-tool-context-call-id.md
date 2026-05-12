---
id: gate-docs-contract-tool-context-call-id
kind: story
stage: review
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

## Implementation notes
Edits applied inline to `docs/CONTRACT.md` as part of the v0.1.1 autopilot doc-drift batch. The roll-forward replaces stale assertions in place per the rolling-foundation principle — no "previously" prose; git history is the audit trail.
