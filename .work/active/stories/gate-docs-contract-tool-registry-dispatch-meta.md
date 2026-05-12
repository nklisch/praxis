---
id: gate-docs-contract-tool-registry-dispatch-meta
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

# CONTRACT.md `ToolRegistry.dispatch` signature omits the `meta?: { callId?: string }` parameter

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/CONTRACT.md:87-90`
- Code: `packages/core/src/types/engine.ts:144-157`, `packages/tools/src/registry.ts:80-107`

## Current doc text
> "interface ToolRegistry { list(): ToolDefinitionSummary[]; dispatch(name: string, args: unknown): Promise<ToolResult>; }"

## Reality
`dispatch` accepts an optional third arg `meta?: ToolDispatchMeta` whose `callId` is threaded into `ToolContext.callId` so handlers that spawn sub-agents can publish events keyed on the parent's callId. Added by `feature-agent-transparency-ux`.

## Required edit
Add `ToolDispatchMeta` interface (with `callId?: string`) next to `ToolRegistry`; update the `dispatch` signature; add `callId?: string` to `ToolContext` later in the doc (see companion story `gate-docs-contract-tool-context-call-id`).

## Implementation notes
Edits applied inline to `docs/CONTRACT.md` as part of the v0.1.1 autopilot doc-drift batch. The roll-forward replaces stale assertions in place per the rolling-foundation principle — no "previously" prose; git history is the audit trail.
