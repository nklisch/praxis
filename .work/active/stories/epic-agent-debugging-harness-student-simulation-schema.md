---
id: epic-agent-debugging-harness-student-simulation-schema
kind: story
stage: done
tags: []
parent: epic-agent-debugging-harness-student-simulation
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
---

# Student simulation schema

## Scope

Add the shared scenario, persona, step, artifact, and result types that both the
client and browser simulation runners consume.

## Files

- `packages/core/src/types/student-simulation.ts`
- `packages/core/src/types/index.ts`
- `packages/core/src/types/debug-bundle.ts`
- `packages/core/src/types/__tests__/student-simulation.test.ts`

## Acceptance criteria

- [x] Shared types export from `@praxis/core/types`.
- [x] `DebugBundleArtifact` can reference `simulation_step` artifacts.
- [x] Scenario/result types include driver, determinism, step status, session
      ids, call ids, renderer event ids, and artifact paths.
- [x] Local results make no redaction promise; export/share sanitization is out
      of scope.

## Implementation Notes

- Added `StudentSimulationScenario`, `StudentPersona`, `StudentSimulationStep`,
  `StudentSimulationResult`, artifact, status, driver, and determinism types.
- Exported the new types through `@praxis/core/types`.
- Added `simulation_step` as a debug bundle evidence source so later stories can
  attach scenario transcripts to failure bundles.
- Added focused type-shape tests proving deterministic scenarios, trace-linked
  results, and debug bundle simulation-step artifacts compile and behave as
  expected.

## Verification

- `pnpm vitest run packages/core/src/types/__tests__/student-simulation.test.ts packages/core/src/services/debug/__tests__/debug-bundle-writer.test.ts`
- `pnpm --filter @praxis/core typecheck`
- `pnpm exec biome check packages/core/src/types/student-simulation.ts packages/core/src/types/debug-bundle.ts packages/core/src/types/index.ts packages/core/src/types/__tests__/student-simulation.test.ts`
- `git diff --check`

## Review (2026-06-01)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Fast-lane story review. Implementation notes include focused Vitest,
core typecheck, focused Biome, and whitespace checks; item advanced to
`stage: done`.
