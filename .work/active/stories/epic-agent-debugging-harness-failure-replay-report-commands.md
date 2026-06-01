---
id: epic-agent-debugging-harness-failure-replay-report-commands
kind: story
stage: implementing
tags: []
parent: epic-agent-debugging-harness-failure-replay
depends_on: [epic-agent-debugging-harness-failure-replay-runner]
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
---

# Inspection report, commands, and browser artifact handoff

## Scope

Add compact Markdown report generation and repo commands for capturing and
replaying local bundles. Browser trace artifacts are manifest/report pointers in
this feature; live browser trace production belongs to student simulation.

## Files

- `packages/core/src/services/debug/debug-bundle-report.ts`
- `packages/core/src/services/debug/__tests__/debug-bundle-report.test.ts`
- `scripts/debug-bundle.ts`
- `scripts/debug-replay.ts`
- `package.json`

## Acceptance criteria

- [ ] Report generation names failure class, first bad observation, run/session/
      turn/call/stream/renderer ids, artifacts, missing evidence, likely owner,
      and next debug step.
- [ ] `debug-bundle.ts` and `debug-replay.ts` commands support explicit temp
      DB/output paths for tests and smoke runs.
- [ ] Browser `trace-zip`, screenshot, and DOM excerpt artifacts render in the
      report when present.
- [ ] The report can print a trace-viewer command for existing browser traces
      without adding Playwright in this feature.
- [ ] Report content is compact enough for a coding agent to consume directly.
