---
id: epic-agent-debugging-harness-student-simulation-scenarios
kind: story
stage: done
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

- [x] Catalog lookup lists scenarios and fails fast for unknown ids.
- [x] Three deterministic scenarios pass through the client runner.
- [x] At least one scenario asserts raw `<invoke`/tool-call markup is absent
      from visible/model-facing output.
- [x] Scenario metadata records supported drivers and determinism.

## Implementation notes

- Added a deterministic scenario catalog plus fixture layer for scripted engine
  turns and quick-check cards.
- Added three initial scenarios: course-create structured question with raw tool
  markup absence checks, teach quick-check wrong-then-right, and teach-to-homework
  mode transition.
- Added lookup helpers that fail fast on unknown ids and coverage that runs every
  fixture through the client runner.

## Verification

- `pnpm vitest run tests/student-simulation-scenarios.test.ts tests/student-simulation-client.test.ts`
- `pnpm exec biome check tests/helpers/student-simulation/client-runner.ts tests/helpers/student-simulation/in-process-client.ts tests/helpers/student-simulation/scripted-engine.ts tests/helpers/student-simulation/personas.ts tests/helpers/student-simulation/scenarios/index.ts tests/helpers/student-simulation/scenarios/course-create-structured-question.ts tests/helpers/student-simulation/scenarios/teach-quick-check-wrong-then-right.ts tests/helpers/student-simulation/scenarios/mode-transition-assignment.ts tests/student-simulation-client.test.ts tests/student-simulation-scenarios.test.ts`
- `pnpm typecheck`
- `git diff --check`

## Review (2026-06-01)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Fast-lane story review. Implementation verification is green, and
the catalog provides the three deterministic fixtures required by the feature
design.
