---
id: gate-docs-contract-engine-event-interrupted-variant
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

# CONTRACT.md `EngineEvent` union missing the `interrupted` variant + `final.finalReason`/`final.errorMessage` fields

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/CONTRACT.md:108-123`
- Code: `packages/core/src/types/engine.ts:193-235`

## Current doc text
> "type EngineEvent = | { type: \"user_message\"; content: string } | { type: \"model_message\"; ... } | ... | { type: \"final\"; usage: TokenUsage } | { type: \"system_note\"; ... };"

## Reality
Union includes seventh variant `| { type: "interrupted"; reason: "user_cancel" | "engine_abort" }` yielded as the final event when an in-flight turn is cancelled. `final` carries optional `finalReason?: "success" | "max_turns" | "generation_error" | "interrupted"` and `errorMessage?: string`. Landed via `epic-bootstrap-readiness-in-flight-affordances`.

## Required edit
Add the `interrupted` variant with a short doc comment on `user_cancel`/`engine_abort`; extend the `final` shape with `finalReason` and `errorMessage`.

## Implementation notes
Edits applied inline to `docs/CONTRACT.md` as part of the v0.1.1 autopilot doc-drift batch. The roll-forward replaces stale assertions in place per the rolling-foundation principle — no "previously" prose; git history is the audit trail.
