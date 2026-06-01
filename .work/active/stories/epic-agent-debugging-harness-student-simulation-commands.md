---
id: epic-agent-debugging-harness-student-simulation-commands
kind: story
stage: review
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

- [x] CLI list and deterministic run paths work.
- [x] Live/model-backed scenarios refuse to run unless
      `PRAXIS_RUN_LIVE_SIMULATION=1` is set.
- [x] Report includes scenario id, persona, driver, determinism, first bad
      observation, correlation ids, artifact paths, and next debug step.
- [x] Report suggests the appropriate `debug:bundle` command when a run fails.

## Implementation Notes

- Added `scripts/student-sim.ts` for scenario listing and deterministic
  client-driver runs. Runs write `simulation-result.json`, events/steps JSONL,
  and `simulation-report.md` under the selected output directory.
- Added `scripts/student-sim-browser.ts` for browser-capable scenario listing
  and direct browser-run handoff when `PRAXIS_RUN_BROWSER_SIMULATION=1` is set.
- Added `tests/helpers/student-simulation/report.ts` to render compact run
  reports with scenario/persona/driver/determinism, first bad observation,
  correlation ids, artifact paths, next debug step, and failed-run
  `pnpm debug:bundle ... --failure-class simulation` guidance.
- Added package scripts `student-sim`, `student-sim:list`, `student-sim:run`,
  and moved `student-sim:browser:list` to the browser CLI wrapper.
- Live/model-backed scenarios now require `PRAXIS_RUN_LIVE_SIMULATION=1` before
  the command layer will run them.

## Verification

- `pnpm vitest run tests/student-simulation-cli.test.ts tests/student-simulation-client.test.ts`
- `pnpm exec biome check package.json scripts/student-sim.ts scripts/student-sim-browser.ts tests/helpers/student-simulation/report.ts tests/student-simulation-cli.test.ts`
- `pnpm student-sim:list`
- `pnpm student-sim:run course-create-structured-question --out .tmp/student-sim-command-smoke --run command-smoke`
- `pnpm student-sim:browser:list`
- `pnpm exec playwright test tests/student-simulation-browser.spec.ts --list`
- `pnpm typecheck`
- `git diff --check`
