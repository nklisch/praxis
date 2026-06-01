# Commands

Run commands from the repo root unless noted.

## Work Queue

```bash
.work/bin/work-view --ready
.work/bin/work-view --stage review
.work/bin/work-view --parent <id>
.work/bin/work-view --blocking <id>
```

## Failure Bundles And Replay

```bash
pnpm debug:bundle --out .praxis/debug/bundles --failure-class <class> --title "<title>" --session <sessionId>
pnpm debug:bundle --out .praxis/debug/bundles --failure-class simulation --title "<title>" --run <runId> --call <callId>
pnpm debug:replay --bundle <bundle-dir> --db <temp-db-path>
```

Use `--first-bad "<text>"` and `--next-step "<text>"` when handing a failure
to another agent.

## Student Simulation

```bash
pnpm student-sim:list
pnpm student-sim:run <scenario-id> --out .praxis/debug/simulations/<run-name> --run <runId>
pnpm student-sim:browser:list
PRAXIS_RUN_BROWSER_SIMULATION=1 pnpm exec playwright test tests/student-simulation-browser.spec.ts
```

Live/model-backed simulation runs require:

```bash
PRAXIS_RUN_LIVE_SIMULATION=1 pnpm student-sim:run <scenario-id>
```

## Browser Trace Inspection

```bash
pnpm exec playwright show-trace <trace.zip>
pnpm exec playwright test tests/student-simulation-browser.spec.ts --list
```

Browser evidence usually includes `trace.zip`, `screenshot.png`, `dom.html`,
`console.md`, and `browser-result.json`.

## Targeted Tests

```bash
pnpm vitest run tests/failure-replay-end-to-end.test.ts
pnpm vitest run tests/student-simulation-client.test.ts tests/student-simulation-scenarios.test.ts tests/student-simulation-cli.test.ts
pnpm vitest run packages/core/src/services/__tests__/session-service.debug-trace.test.ts
pnpm vitest run packages/tools/src/__tests__/registry.test.ts
pnpm vitest run packages/ui/src/__tests__/authoring-chat-pane-quick-check.test.tsx
pnpm typecheck
```

## DB Inspectors

```bash
pnpm db:show
pnpm db:episodic
pnpm db:gates
pnpm db:packs
pnpm db:configurator-actions
```

For replay or simulation, use an explicit temp DB path. Do not let a debug run
mutate `.praxis/dev.db`.
