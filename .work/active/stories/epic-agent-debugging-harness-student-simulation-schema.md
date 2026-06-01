---
id: epic-agent-debugging-harness-student-simulation-schema
kind: story
stage: implementing
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

- [ ] Shared types export from `@praxis/core/types`.
- [ ] `DebugBundleArtifact` can reference `simulation_step` artifacts.
- [ ] Scenario/result types include driver, determinism, step status, session
      ids, call ids, renderer event ids, and artifact paths.
- [ ] Local results make no redaction promise; export/share sanitization is out
      of scope.

