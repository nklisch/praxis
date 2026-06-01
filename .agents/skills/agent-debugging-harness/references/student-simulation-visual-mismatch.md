# Student Simulation Visual Mismatch

Use when a synthetic student scenario fails in the browser tier, a visible UI
assertion differs from the client tier, or visual artifacts show raw tool
markup, object rendering, missing cards, or layout overlap.

## First Checks

- Confirm whether the client driver passes for the same scenario.
- Read `browser-result.json` for failed step, `runId`, `sessionIds`, `callIds`,
  and artifact paths.
- Inspect final `dom.html` before opening screenshots or traces.

## Evidence To Gather

- `browser-result.json`
- `trace.zip`
- `screenshot.png`
- `dom.html`
- `console.md`
- Matching client-run `simulation-result.json` and JSONL events when available.

## Commands

```bash
pnpm student-sim:list
pnpm student-sim:run <scenario-id> --out .praxis/debug/simulations/<scenario-id>-client
PRAXIS_RUN_BROWSER_SIMULATION=1 pnpm exec playwright test tests/student-simulation-browser.spec.ts
pnpm exec playwright show-trace <trace.zip>
pnpm debug:bundle --out .praxis/debug/bundles --failure-class simulation --title "student simulation visual mismatch" --run <runId> --call <callId>
```

## Likely Owners

- Scenario/fixture: `tests/helpers/student-simulation/scenarios/`
- Client runner: `tests/helpers/student-simulation/client-runner.ts`
- Browser runner/app: `tests/helpers/student-simulation/browser-runner.ts`,
  `tests/student-simulation/browser-app.tsx`
- UI rendering: `packages/ui/src/`

## Next Debug Step

Compare client events to browser-visible DOM. If the event sequence is correct
but DOM is wrong, route to UI. If both tiers disagree on events, route to the
scenario fixture or client runner.
