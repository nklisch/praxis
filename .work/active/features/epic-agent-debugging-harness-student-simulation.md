---
id: epic-agent-debugging-harness-student-simulation
kind: feature
stage: drafting
tags: []
parent: epic-agent-debugging-harness
depends_on: [epic-agent-debugging-harness-tooling-research, epic-agent-debugging-harness-trace-correlation]
release_binding: null
gate_origin: null
created: 2026-05-31
updated: 2026-06-01
---

# Student Simulation

## Brief

Create an internal synthetic-student harness that can drive Praxis through realistic tutoring flows and exercise the agent harness itself. The simulator should model student personas, goals, wrong answers, confusion, disengagement, course-create requests, structured-question responses, quick-check answers, assignment submissions, and mode transitions through public app/client surfaces rather than private service shortcuts wherever practical.

The harness should produce trace-linked scenario results that can be inspected by agents and humans. It should support both deterministic canned personas for regression coverage and model-backed or scripted variants where useful, while keeping live-model cost and nondeterminism explicit in the output.

This feature does not define the trace format or failure bundle format. It consumes trace correlation and the tooling decisions, then emits scenario runs that later features can bundle, replay, and summarize.

## Epic context

- Parent epic: `epic-agent-debugging-harness`
- Position in epic: consumer of trace contracts - can proceed in parallel with failure replay after trace correlation exists.

## Foundation references

- `docs/VISION.md` - Praxis optimizes learning, productive struggle, verification, and source awareness.
- `docs/SPEC.md` - verification rules, human-in-the-loop dispatch, local-first ownership, and v1 scope.
- `docs/UX.md` - student and course-create journeys, mode behavior, quick checks, structured questions, and tab persistence.
- `docs/ARCHITECTURE.md` - `@praxis/client` transport boundary, session flow, tools, memory, and artifacts.
