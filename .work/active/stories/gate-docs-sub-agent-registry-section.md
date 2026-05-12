---
id: gate-docs-sub-agent-registry-section
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

# CONTRACT.md + ARCHITECTURE.md don't document `SubAgentRegistry`, sub-agent events, or the `praxis.subAgent.*` IPC channels

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/CONTRACT.md` (no entry); `docs/ARCHITECTURE.md:310` (mentions sub-agents only as an aside)
- Code: `packages/core/src/types/subagent.ts`, `packages/desktop/electron/main/subagent-channel.ts`, `packages/client/src/services/sub-agent-client.ts`, `packages/ui/src/components/sub-agent-block.tsx`, `packages/ui/src/components/sub-agent-panel.tsx`

## Current doc text
ARCHITECTURE.md:310 — "Tool implementations may themselves call sub-agents (e.g., `grade_with_rubric` runs a small grader agent against the rubric)."

## Reality
A first-class `SubAgentRegistry` port ships in `ServiceDeps.subAgent` and `ServiceDeps.toolServices.subAgent`. Tools that spawn isolated sessions (e.g. `course.start_exploration`) acquire a `SubAgentHandle` from `subAgent.start(...)` and emit `step_started` / `step_settled` / `phase_changed` events. UI subscribes via `praxis.subAgent.events.start` / `.events.<streamId>` / `.cancel`, plus `praxis.subAgent.list`. `<SubAgentBlock>` renders inline in the chat thread.

## Required edit
Add a new CONTRACT.md section "Sub-agent transparency" containing `SubAgentItem`, `SubAgentStep`, `SubAgentEvent`, `SubAgentRegistry`, `SubAgentHandle` types and the IPC channel names. In ARCHITECTURE.md, extend the "Where the big pieces live" enumeration and the "Tool dispatch architecture" section to describe sub-agent event publication.

## Implementation notes
Edits applied inline to `docs/CONTRACT.md` as part of the v0.1.1 autopilot doc-drift batch. The roll-forward replaces stale assertions in place per the rolling-foundation principle — no "previously" prose; git history is the audit trail.
