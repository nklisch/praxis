---
id: epic-agent-debugging-harness
kind: epic
stage: review
tags: []
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-31
updated: 2026-06-01
---

# Agent debugging harness

## Brief

Create a research-and-build arc that makes Praxis agent failures easy for future agents and humans to reproduce, inspect, and explain. The work should find the right mix of tools, practices, logging, trace capture, replay, and runbook conventions for debugging issues across the agent loop, tool dispatch, sub-agents, IPC streams, UI rendering, and persistence.

The same arc should cover student simulation: an internal harness that can act like a student against the Praxis tutoring surfaces, drive realistic mode flows, and exercise the agent harness itself. This is not a student-facing feature; it is developer and agent infrastructure for finding regressions, validating tutoring behavior, and producing evidence bundles that make failures actionable instead of chat-history archaeology.

Recent failures motivate the scope: raw tool-call markup leaked into course-create chat, `course.start_drafting` could abort before the drafter launched on a document-scope FK failure, and a structured tool summary crashed React. The epic should turn that kind of investigation from an ad hoc manual pass into a repeatable path.

## Strategic decisions

- **Audience**: Internal developers and coding agents first, not students. Any UI should be a diagnostic surface or report, not a tutoring product surface.
- **Tool choice**: Do not lock in a vendor or framework at scope time. The design pass should run current-source research for candidate tracing, logging, replay, evaluation, and browser automation tools before choosing.
- **Simulation style**: Include both replay of captured real sessions and synthetic student personas that drive live sessions through public app/client surfaces.
- **Evidence standard**: A useful run emits full-fidelity local traces, correlated logs, inputs, tool calls, model events, UI-visible outcomes, and a short failure summary that another agent can consume without re-running the whole app. Sanitization is an explicit export/share step, not the local capture default.
- **Boundary**: The harness complements unit, integration, and e2e tests; it does not replace them or weaken test integrity. Failing scenarios should still become substrate items when they expose product bugs.

## Initial Area Map

- Agent loop and persistence: `packages/core/src/services/session-service.ts`, `packages/core/src/services/session/engine-session-manager.ts`, engine adapters under `packages/engines/src/`, and the `async-generator-event-stream` / `episodic-append-ordering` patterns.
- Tool execution: `packages/tools/src/registry.ts`, tool definitions under `packages/tools/src/`, and existing `tool.dispatch.*` structured logs.
- Sub-agent visibility: `SubAgentRegistry`, `course.start_drafting`, drafter tools, and course-create chat surfaces.
- Client and IPC: `packages/client/src/`, `packages/desktop/electron/main/`, streaming IPC channel helpers, and IPC envelope error handling.
- UI verification: chat tab bodies, authoring chat panes, tool-call renderers, structured question/quick-check cards, and Playwright-style browser flows if adopted.
- Test substrate: root `tests/`, package colocated Vitest tests, existing fake clients/engines, and temp DB helpers.

## Epic-Design Notes

`epic-design` should decompose this into cohesive features rather than one monolithic harness. Likely arcs include research and tool selection, trace/log correlation conventions, reproducible failure bundle capture, replay of stored sessions, synthetic student simulation scenarios, and documentation/runbooks for agents debugging Praxis.

No foundation-doc roll-forward at scope time: this item intentionally frames an internal capability and research campaign. The design pass should update `docs/SPEC.md` or `docs/ARCHITECTURE.md` only after it chooses durable contracts, services, or operational expectations.

## UI alignment

No mockups produced at epic-design time. The decomposition keeps v1 output as internal commands, reports, research notes, and test/simulation harnesses rather than a net-new in-app diagnostic screen. If a later feature-design pass chooses to add a visual diagnostic viewer, that feature should run the mockup workflow before implementation.

## Decomposition

Split by capability rather than by package layer: one feature chooses the evidence/tooling direction, one establishes shared trace correlation, two parallel consumers build replay and student simulation on top, and one final feature turns those capabilities into agent-usable reports and runbooks. This avoids a single oversized "debug harness" feature while keeping the common trace vocabulary as the shared dependency.

### Child features

- `epic-agent-debugging-harness-tooling-research` - current-source research and evidence/tool selection - depends on: `[]`
- `epic-agent-debugging-harness-trace-correlation` - shared trace IDs and capture hooks across session, engine, tool, sub-agent, IPC, and UI outcomes - depends on: `[epic-agent-debugging-harness-tooling-research]`
- `epic-agent-debugging-harness-failure-replay` - failure bundle export and deterministic replay/inspection primitives - depends on: `[epic-agent-debugging-harness-tooling-research, epic-agent-debugging-harness-trace-correlation]`
- `epic-agent-debugging-harness-student-simulation` - synthetic student personas and scenario runner through public app/client surfaces - depends on: `[epic-agent-debugging-harness-tooling-research, epic-agent-debugging-harness-trace-correlation]`
- `epic-agent-debugging-harness-debug-runbooks` - agent-facing progressive-disclosure skill(s) for reports, commands, owner routing, and debugging runbooks - depends on: `[epic-agent-debugging-harness-failure-replay, epic-agent-debugging-harness-student-simulation]`

### Decomposition risks

The riskiest seam is trace correlation: if it becomes a broad observability rewrite, the downstream features will inherit churn. Keep it additive, local-first, full-fidelity for local debug bundles, explicit about bounded retention, and shaped around existing `EngineEvent`, logger, tool dispatch, sub-agent, and IPC contracts. Sanitization belongs to export/share adapters.

Replay and synthetic student simulation can drift into flaky live-model tests if not bounded. Feature design should separate deterministic regression paths from optional live-engine probes and should record nondeterminism explicitly in each run's output.

## Children Complete (2026-06-01)

All five child features reached `done`: tooling research, trace correlation,
failure replay, student simulation, and debug runbooks. Epic is ready for final
review.
