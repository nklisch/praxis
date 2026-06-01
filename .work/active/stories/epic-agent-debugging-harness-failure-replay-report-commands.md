---
id: epic-agent-debugging-harness-failure-replay-report-commands
kind: story
stage: done
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

- [x] Report generation names failure class, first bad observation, run/session/
      turn/call/stream/renderer ids, artifacts, missing evidence, likely owner,
      and next debug step.
- [x] `debug-bundle.ts` and `debug-replay.ts` commands support explicit temp
      DB/output paths for tests and smoke runs.
- [x] Browser `trace-zip`, screenshot, and DOM excerpt artifacts render in the
      report when present.
- [x] The report can print a trace-viewer command for existing browser traces
      without adding Playwright in this feature.
- [x] Report content is compact enough for a coding agent to consume directly.

## Implementation Notes

- Added `generateDebugBundleReport(...)`, producing compact Markdown with
  failure class, owner routing, run/session/turn/call/stream/renderer ids,
  artifacts, missing evidence, browser handoff, and next debug step.
- Browser `trace-zip`, screenshot, and DOM excerpt artifacts render in the
  report; trace zip entries include a `pnpm exec playwright show-trace ...`
  command without adding Playwright to this feature.
- Added `pnpm debug:bundle` via `scripts/debug-bundle.ts`; it supports explicit
  `--db`, `--out`, session/run/turn/call selectors, log path, first-bad
  observation, and next-step text.
- Added `pnpm debug:replay` via `scripts/debug-replay.ts`; it requires explicit
  `--bundle` and `--db` so replay uses a caller-provided temp DB path.

## Verification

- `pnpm vitest run packages/core/src/services/debug/__tests__/debug-bundle-report.test.ts packages/core/src/services/debug/__tests__/debug-bundle-loader.test.ts tests/failure-replay-end-to-end.test.ts`
- `pnpm typecheck`
- `pnpm exec biome check packages/core/src/services/debug/debug-bundle-report.ts packages/core/src/services/debug/index.ts packages/core/src/services/index.ts packages/core/src/services/debug/__tests__/debug-bundle-report.test.ts scripts/debug-bundle.ts scripts/debug-replay.ts package.json tests/helpers/replay-runner.ts`
- `pnpm debug:bundle --help`
- `pnpm debug:replay --help`
- `git diff --check`

## Review (2026-06-01)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Fast-lane story review. Implementation notes include green focused
tests, full typecheck, focused Biome, script help smoke checks, and whitespace
checks; item advanced to `stage: done`.
