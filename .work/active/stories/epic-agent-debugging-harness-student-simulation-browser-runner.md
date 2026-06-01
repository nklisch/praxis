---
id: epic-agent-debugging-harness-student-simulation-browser-runner
kind: story
stage: done
tags: []
parent: epic-agent-debugging-harness-student-simulation
depends_on: [epic-agent-debugging-harness-student-simulation-scenarios]
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
---

# Browser visual simulation runner

## Scope

Add the Playwright-backed visual tier that mounts/drives the real Praxis
renderer with a simulation client fixture and captures trace, screenshot, DOM,
and console evidence for visual anomalies.

## Files

- `package.json`
- `pnpm-lock.yaml`
- `playwright.config.ts`
- `tests/helpers/student-simulation/browser-runner.ts`
- `tests/helpers/student-simulation/browser-fixture.ts`
- `tests/student-simulation-browser.spec.ts`
- `tests/student-simulation/browser-app.html`
- `tests/student-simulation/browser-app.tsx`

## Acceptance criteria

- [x] Browser scenario list path works without launching a browser.
- [x] Browser visual scenario fails on raw tool-call markup or object rendering
      such as `[object Object]`.
- [x] Failure output includes trace, screenshot, DOM excerpt, console log, and
      result JSON paths under a local output directory.
- [x] Browser runs are gated behind an explicit command/env and do not run in
      default `pnpm test`.

## Implementation Notes

- Added a Playwright browser simulation tier with `playwright.config.ts`, a gated
  `student-sim:browser` script, and a list-only `student-sim:browser:list`
  command.
- Added `StudentSimulationBrowserRunnerImpl`, which mounts the browser app,
  runs a browser-capable simulation scenario, detects visible `<invoke` /
  `[object Object]` anomalies, and writes result JSON plus trace, screenshot,
  DOM, and console artifacts when evidence is requested or a failure occurs.
- Added a Vite-backed browser simulation app that uses real chat UI components
  (`MessageBubble`, `ToolCallDisclosure`, quick-check cards, thinking indicator)
  with a browser-safe scripted `PraxisClient` fixture.
- Browser execution is gated by `PRAXIS_RUN_BROWSER_SIMULATION=1`; without the
  env var, Playwright enumerates/skips the browser tests without launching the
  browser path.
- Added `.gitignore` entries for Playwright output directories.

## Verification

- `pnpm student-sim:browser:list`
- `pnpm exec playwright test tests/student-simulation-browser.spec.ts --list`
- `pnpm exec playwright test tests/student-simulation-browser.spec.ts`
- `PRAXIS_RUN_BROWSER_SIMULATION=1 pnpm exec playwright test tests/student-simulation-browser.spec.ts`
- `pnpm exec biome check package.json tsconfig.json playwright.config.ts tests/helpers/student-simulation/browser-fixture.ts tests/helpers/student-simulation/browser-runner.ts tests/student-simulation/browser-app.tsx tests/student-simulation-browser.spec.ts`
- `pnpm typecheck`
- `git diff --check`

## Review (2026-06-01)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Fast-lane story review; implementation recorded green browser,
typecheck, focused lint, and diff checks.
