---
id: epic-agent-debugging-harness-student-simulation-commands
kind: story
stage: implementing
tags: []
parent: epic-agent-debugging-harness-student-simulation
depends_on: [epic-agent-debugging-harness-student-simulation-browser-runner]
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
---

# Simulation commands and reports

## Scope

Expose scenario listing/running commands, report generation, live-run gating,
and failure-bundle handoff text for the simulation harness.

## Files

- `scripts/student-sim.ts`
- `scripts/student-sim-browser.ts`
- `package.json`
- `tests/student-simulation-cli.test.ts`
- `tests/helpers/student-simulation/report.ts`

## Acceptance criteria

- [ ] CLI list and deterministic run paths work.
- [ ] Live/model-backed scenarios refuse to run unless
      `PRAXIS_RUN_LIVE_SIMULATION=1` is set.
- [ ] Report includes scenario id, persona, driver, determinism, first bad
      observation, correlation ids, artifact paths, and next debug step.
- [ ] Report suggests the appropriate `debug:bundle` command when a run fails.
