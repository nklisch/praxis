---
id: epic-agent-debugging-harness-student-simulation-client-runner
kind: story
stage: implementing
tags: []
parent: epic-agent-debugging-harness-student-simulation
depends_on: [epic-agent-debugging-harness-student-simulation-schema]
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
---

# Deterministic client runner

## Scope

Implement the fast simulation tier that drives a `PraxisClient` with scripted
student/persona steps and fake engine output, producing a
`StudentSimulationResult`.

## Files

- `tests/helpers/student-simulation/client-runner.ts`
- `tests/helpers/student-simulation/in-process-client.ts`
- `tests/helpers/student-simulation/scripted-engine.ts`
- `tests/helpers/student-simulation/personas.ts`
- `tests/student-simulation-client.test.ts`

## Acceptance criteria

- [ ] A scripted scenario can start a session, send messages, collect events,
      answer a quick check, and pass.
- [ ] Runner uses `useTempDb()` or explicit temp DB paths and never touches
      `.praxis/dev.db`.
- [ ] Runner writes result JSON plus event/step JSONL artifacts.
- [ ] First failing step records an observation, error, and related correlation
      ids.

