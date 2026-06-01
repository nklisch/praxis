---
id: epic-agent-debugging-harness-student-simulation-scenarios
kind: story
stage: implementing
tags: []
parent: epic-agent-debugging-harness-student-simulation
depends_on: [epic-agent-debugging-harness-student-simulation-client-runner]
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
---

# Deterministic scenario catalog

## Scope

Create the first scripted student scenarios that exercise course-create,
quick-check, and mode-transition flows through the client runner.

## Files

- `tests/helpers/student-simulation/scenarios/index.ts`
- `tests/helpers/student-simulation/scenarios/course-create-structured-question.ts`
- `tests/helpers/student-simulation/scenarios/teach-quick-check-wrong-then-right.ts`
- `tests/helpers/student-simulation/scenarios/mode-transition-assignment.ts`
- `tests/student-simulation-scenarios.test.ts`

## Acceptance criteria

- [ ] Catalog lookup lists scenarios and fails fast for unknown ids.
- [ ] Three deterministic scenarios pass through the client runner.
- [ ] At least one scenario asserts raw `<invoke`/tool-call markup is absent
      from visible/model-facing output.
- [ ] Scenario metadata records supported drivers and determinism.

