---
id: epic-agent-debugging-harness-failure-replay
kind: feature
stage: drafting
tags: []
parent: epic-agent-debugging-harness
depends_on: [epic-agent-debugging-harness-tooling-research, epic-agent-debugging-harness-trace-correlation]
release_binding: null
gate_origin: null
created: 2026-05-31
updated: 2026-05-31
---

# Failure Bundles And Replay

## Brief

Build the internal mechanism for exporting a failed agent run into a compact evidence bundle and replaying enough of that run to reproduce or inspect the failure. A bundle should collect the relevant trace slice, structured logs, engine events, tool inputs/results, sub-agent activity, episodic rows, selected DB state, and UI-visible outcomes according to the evidence standard chosen by the tooling feature.

Replay should favor deterministic and local execution first: fake engines, recorded event streams, temp DB setup, and existing service/test seams. Where exact live-engine reproduction is not possible, replay should make that explicit and still provide a useful inspection path that shows the stored transcript and tool/UI sequence.

This feature does not create new student behaviors or scenario generation. It consumes trace correlation and produces reusable bundle/replay primitives that synthetic student simulation and debugging runbooks can call.

## Epic context

- Parent epic: `epic-agent-debugging-harness`
- Position in epic: trace consumer and reusable primitive - simulation and runbooks build on the bundle/replay path.

## Foundation references

- `docs/SPEC.md` - local-first data ownership and no telemetry by default.
- `docs/ARCHITECTURE.md` - storage architecture, session data flow, and transport boundaries.
- `docs/CONTRACT.md` - stable event and service contracts for replay input.
- `.agents/skills/patterns/temp-db-test-helper.md` - replay tests must never touch `.praxis/dev.db`.
- `.agents/skills/patterns/service-deps-injection.md` - fake engines and service seams should remain the injection path.
