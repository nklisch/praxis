---
id: epic-agent-debugging-harness-student-simulation-client-runner
kind: story
stage: review
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

- [x] A scripted scenario can start a session, send messages, collect events,
      answer a quick check, and pass.
- [x] Runner uses `useTempDb()` or explicit temp DB paths and never touches
      `.praxis/dev.db`.
- [x] Runner writes result JSON plus event/step JSONL artifacts.
- [x] First failing step records an observation, error, and related correlation
      ids.

## Implementation notes

- Added a deterministic client runner that executes shared
  `StudentSimulationScenario` steps through a `PraxisClient`, owns session refs,
  answers quick checks from persona strategy, and writes result, event, and step
  artifacts.
- Added a scripted in-process `PraxisClient` fixture for tests. It emits
  replay-style engine events, records lightweight debug-trace records, exposes a
  quick-check event stream with backlog replay, and refuses `.praxis/dev.db`.
- Added reusable student personas and focused coverage for the passing path,
  first-failure correlation, artifact output, and dev-DB guard.

## Verification

- `pnpm vitest run tests/student-simulation-client.test.ts`
- `pnpm exec biome check tests/helpers/student-simulation/client-runner.ts tests/helpers/student-simulation/in-process-client.ts tests/helpers/student-simulation/scripted-engine.ts tests/helpers/student-simulation/personas.ts tests/student-simulation-client.test.ts`
- `pnpm --filter @praxis/core build`
- `pnpm typecheck`
- `git diff --check`
