---
id: epic-agent-debugging-harness-student-simulation-browser-runner
kind: story
stage: implementing
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

- [ ] Browser scenario list path works without launching a browser.
- [ ] Browser visual scenario fails on raw tool-call markup or object rendering
      such as `[object Object]`.
- [ ] Failure output includes trace, screenshot, DOM excerpt, console log, and
      result JSON paths under a local output directory.
- [ ] Browser runs are gated behind an explicit command/env and do not run in
      default `pnpm test`.

