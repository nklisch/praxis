---
id: epic-agent-debugging-harness-student-simulation
kind: feature
stage: done
tags: []
parent: epic-agent-debugging-harness
depends_on: [epic-agent-debugging-harness-tooling-research, epic-agent-debugging-harness-trace-correlation]
release_binding: null
gate_origin: null
created: 2026-05-31
updated: 2026-06-01
---

# Student Simulation

## Brief

Create an internal synthetic-student harness that can drive Praxis through realistic tutoring flows and exercise the agent harness itself. The simulator should model student personas, goals, wrong answers, confusion, disengagement, course-create requests, structured-question responses, quick-check answers, assignment submissions, and mode transitions through public app/client surfaces rather than private service shortcuts wherever practical.

The harness should produce trace-linked scenario results that can be inspected by agents and humans. It should support both deterministic canned personas for regression coverage and model-backed or scripted variants where useful, while keeping live-model cost and nondeterminism explicit in the output.

This feature does not define the trace format or failure bundle format. It consumes trace correlation and the tooling decisions, then emits scenario runs that later features can bundle, replay, and summarize.

## Epic context

- Parent epic: `epic-agent-debugging-harness`
- Position in epic: consumer of trace contracts - can proceed in parallel with failure replay after trace correlation exists.

## Foundation references

- `docs/VISION.md` - Praxis optimizes learning, productive struggle, verification, and source awareness.
- `docs/SPEC.md` - verification rules, human-in-the-loop dispatch, local-first ownership, and v1 scope.
- `docs/UX.md` - student and course-create journeys, mode behavior, quick checks, structured questions, and tab persistence.
- `docs/ARCHITECTURE.md` - `@praxis/client` transport boundary, session flow, tools, memory, and artifacts.

## UI alignment

No mockups for this feature. It adds internal simulation runners, scenarios,
reports, and Playwright-driven visual checks over existing Praxis UI surfaces.
There is no new student-facing diagnostic screen.

## Other agent review

A fresh-context advisory pass recommended splitting simulation into two tiers:
a fast deterministic API/client tier and a slower browser visual tier, both
joined by a common scenario/result contract. It also flagged the trace registry
ring buffer, temp DB isolation, live-model cost, and transport boundary as the
load-bearing risks.

Accepted decisions:

- Share one scenario/result schema across API and browser runners.
- Use deterministic scripted personas and fake engines by default.
- Treat live/model-backed student variants as explicit opt-in runs with cost and
  nondeterminism recorded in the result.
- Give each scenario a dedicated temp DB and debug trace registry so runs do not
  share BKT/mastery state or overflow the desktop singleton trace buffer.

Rejected/adapted recommendation:

- The advisory suggested a Vite SPA plus WebSocket transport for browser runs.
  Current `createWebSocketTransport` is still a stub, so v1 browser simulation
  uses Playwright against the real Praxis renderer surface with a simulation
  client/transport fixture for deterministic visual checks. Electron launch is
  kept as an optional smoke adapter for the real IPC app once a deterministic
  engine injection seam exists there.

## Design decisions

- **Simulation tiers**: Use two tiers: `client` for fast deterministic
  `PraxisClient`-level runs, and `browser` for Playwright visual runs. Both emit
  the same `StudentSimulationResult`.
- **Browser evidence**: Add Playwright in this feature. Playwright's Electron
  support is still marked experimental in official docs, while Trace Viewer
  provides action timelines, console/errors, screenshots, and DOM snapshots, so
  v1 uses browser traces as local evidence rather than as the only oracle.
- **Local evidence**: Store full local transcripts, screenshots, DOM excerpts,
  and traces under the scenario output directory. No redaction is required for
  local output; sanitization is only for future explicit export/share flows.
- **Live model runs**: Default CI and local commands use scripted engines. Live
  model/persona variants require `PRAXIS_RUN_LIVE_SIMULATION=1` and must write
  `determinism: "live"` plus token/cost metadata when available.
- **Transport boundary**: Runners drive `PraxisClient` or the rendered app
  surface. Service shortcuts are allowed only inside test fixtures that create a
  `PraxisClient`-compatible adapter over local services.

## Architectural choice

### Option A: Service-only scenario runner

Drive `SessionServiceImpl` and tool services directly with fake engines. This is
fast and deterministic, but it misses renderer, IPC/client, quick-check card,
structured-question card, and visual layout failures.

### Option B: Browser-only Playwright runner

Drive the app visually through Playwright for every scenario. This captures the
actual UI state and visual anomalies, but it is slower, harder to isolate, and
too expensive for normal unit-level regression.

### Option C: Shared scenario contract with client and browser adapters

Define one scenario/result contract, run it through a deterministic
`PraxisClient` adapter for normal regression, and run selected scenarios through
Playwright for visual evidence. Browser artifacts are attached to the same
result shape that failure bundles already understand.

**Chosen**: Option C. It gives agents a cheap deterministic regression path
while still making browser replay/visual anomaly evidence a first-class output.

## Implementation Units

### Unit 1: Scenario and result model

**Story**: `epic-agent-debugging-harness-student-simulation-schema`

**Files**:

- `packages/core/src/types/student-simulation.ts`
- `packages/core/src/types/index.ts`
- `packages/core/src/types/debug-bundle.ts`
- `packages/core/src/types/__tests__/student-simulation.test.ts`

```ts
export type StudentSimulationDriverKind = "client" | "browser";
export type StudentSimulationDeterminism = "scripted" | "live";
export type StudentSimulationStatus = "passed" | "failed" | "skipped";

export interface StudentPersona {
  id: string;
  label: string;
  gradeBand?: string;
  traits: readonly string[];
  wrongAnswerStyle?: "misconception" | "guess" | "partial" | "avoidant";
}

export type StudentSimulationStep =
  | { kind: "start-session"; ref: string; modeId: string }
  | { kind: "send-message"; sessionRef: string; text: string }
  | { kind: "answer-quick-check"; strategy: "wrong" | "right" | "abandon" | "scripted" }
  | { kind: "expect-event"; sessionRef: string; eventType: string; callId?: string }
  | { kind: "expect-visible"; text: string; absent?: boolean }
  | { kind: "capture-browser-artifacts"; label: string };

export interface StudentSimulationScenario {
  id: string;
  title: string;
  persona: StudentPersona;
  determinism: StudentSimulationDeterminism;
  drivers: readonly StudentSimulationDriverKind[];
  tags: readonly string[];
  steps: readonly StudentSimulationStep[];
  maxTurns?: number;
}

export interface StudentSimulationArtifact {
  kind: "jsonl" | "json" | "markdown" | "trace-zip" | "screenshot" | "dom-excerpt";
  path: string;
  source: "simulation_step" | "browser_trace" | "renderer" | "session_event";
  description?: string;
}

export interface StudentSimulationResult {
  kind: "student_simulation_result";
  schemaVersion: 1;
  scenarioId: string;
  runId: string;
  driver: StudentSimulationDriverKind;
  determinism: StudentSimulationDeterminism;
  status: StudentSimulationStatus;
  startedAt: string;
  finishedAt: string;
  summary: string;
  sessionIds: string[];
  callIds: string[];
  rendererEventIds: string[];
  steps: Array<{
    index: number;
    kind: StudentSimulationStep["kind"];
    status: StudentSimulationStatus;
    observation?: string;
    error?: string;
  }>;
  artifacts: StudentSimulationArtifact[];
  tokenUsage?: { inputTokens: number; outputTokens: number };
}
```

**Implementation notes**:

- `DebugBundleArtifact["source"]` should gain `"simulation_step"` so failure
  bundles can point at scenario transcripts without abusing `manual_note`.
- Keep the schema plain TypeScript for v1; add Zod only if the CLI accepts
  external JSON scenario files.
- Avoid text redaction in the local result. Future export adapters can write a
  sanitized derivative.

**Acceptance criteria**:

- [ ] Shared types export from `@praxis/core/types`.
- [ ] Result artifacts can reference browser trace, screenshot, DOM excerpt, and
      simulation-step JSONL files.
- [ ] Type tests or unit tests prove invalid step/result shapes are rejected by
      TypeScript where practical.

### Unit 2: Deterministic client runner

**Story**: `epic-agent-debugging-harness-student-simulation-client-runner`

**Files**:

- `tests/helpers/student-simulation/client-runner.ts`
- `tests/helpers/student-simulation/in-process-client.ts`
- `tests/helpers/student-simulation/scripted-engine.ts`
- `tests/helpers/student-simulation/personas.ts`
- `tests/student-simulation-client.test.ts`

```ts
export interface StudentSimulationClientRunnerInput {
  scenario: StudentSimulationScenario;
  client: PraxisClient;
  outputDir: string;
  runId?: string;
  debugTrace?: DebugTraceRegistry;
  now?: () => Date;
}

export interface StudentSimulationClientRunner {
  run(input: StudentSimulationClientRunnerInput): Promise<StudentSimulationResult>;
}

export function createInProcessSimulationClient(input: {
  dbPath: string;
  engineTurns: readonly ReplayTurn[];
  debugTrace: DebugTraceRegistry;
}): Promise<PraxisClient>;
```

**Implementation notes**:

- The runner owns a session-ref map so scenario steps can say `sessionRef:
  "teach"` rather than hard-coding generated session IDs.
- `answer-quick-check` subscribes to `client.quickCheck.events()` and resolves
  pending cards according to the persona strategy. Wrong-then-right flows are
  represented as separate steps.
- `createInProcessSimulationClient` builds a `PraxisClient`-compatible adapter
  over local services for tests. It may use `SessionServiceImpl` internally, but
  the runner only sees `PraxisClient`.
- Use a dedicated `DebugTraceRegistryImpl({ maxRecords: 10_000 })` per run or
  explicit per-step flushes; do not depend on the desktop singleton's 200-record
  ring buffer.

**Acceptance criteria**:

- [ ] A scripted scenario can start a session, send messages, collect engine
      events, answer a quick check, and produce a passing
      `StudentSimulationResult`.
- [ ] Each run uses a temp DB and does not touch `.praxis/dev.db`.
- [ ] The result writes a JSON result and an engine/session event JSONL artifact.
- [ ] Failures include the first bad step and enough ids for failure-bundle
      capture.

### Unit 3: Deterministic scenario catalog

**Story**: `epic-agent-debugging-harness-student-simulation-scenarios`

**Files**:

- `tests/helpers/student-simulation/scenarios/index.ts`
- `tests/helpers/student-simulation/scenarios/course-create-structured-question.ts`
- `tests/helpers/student-simulation/scenarios/teach-quick-check-wrong-then-right.ts`
- `tests/helpers/student-simulation/scenarios/mode-transition-assignment.ts`
- `tests/student-simulation-scenarios.test.ts`

```ts
export const STUDENT_SIMULATION_SCENARIOS: readonly StudentSimulationScenario[];

export function getStudentSimulationScenario(id: string): StudentSimulationScenario;
```

**Implementation notes**:

- Initial scenarios should cover the motivating failures and common tutoring
  flows:
  - course-create structured question response without raw tool markup leaking
    into visible chat output;
  - teach-mode quick check with a wrong answer followed by a right answer;
  - assignment/mode transition from teach to child quiz/homework and back.
- Scenario definitions stay deterministic and small. Live variants are tagged
  but skipped unless the live-run guard is set.

**Acceptance criteria**:

- [ ] Catalog lookup fails fast on an unknown ID.
- [ ] The three deterministic scenarios pass through the client runner.
- [ ] At least one scenario asserts absence of raw `<invoke`/tool-call markup.
- [ ] Scenario metadata clearly records `drivers` and `determinism`.

### Unit 4: Browser visual simulation runner

**Story**: `epic-agent-debugging-harness-student-simulation-browser-runner`

**Files**:

- `package.json`
- `pnpm-lock.yaml`
- `playwright.config.ts`
- `tests/helpers/student-simulation/browser-runner.ts`
- `tests/helpers/student-simulation/browser-fixture.ts`
- `tests/student-simulation-browser.spec.ts`
- `tests/student-simulation/browser-app.html`
- `tests/student-simulation/browser-app.tsx`

```ts
export interface StudentSimulationBrowserRunnerInput {
  scenario: StudentSimulationScenario;
  outputDir: string;
  keepArtifacts?: boolean;
  headed?: boolean;
}

export interface StudentSimulationBrowserRunner {
  run(input: StudentSimulationBrowserRunnerInput): Promise<StudentSimulationResult>;
}
```

**Implementation notes**:

- Add Playwright as a dev/test dependency in this story. Use official
  Playwright docs as the implementation reference; docs verified on
  2026-06-01 note that Trace Viewer records action timelines, errors, console,
  network, screenshots, and interactive DOM snapshots, and Electron automation
  is experimental.
- The first browser runner mounts the real `PraxisApp` in a Playwright-controlled
  browser page with a simulation client fixture. This catches renderer layout,
  card, raw-object rendering, and visible chat anomalies deterministically.
- Add an Electron smoke helper only as an optional adapter. Do not make default
  browser scenarios depend on live Electron IPC until deterministic engine
  injection exists for the desktop composition root.
- On failure, and when `keepArtifacts` is true, write trace zip, screenshot, DOM
  excerpt, console log, and the shared `StudentSimulationResult`.

**Acceptance criteria**:

- [ ] `pnpm student-sim:browser -- --list` or equivalent lists browser-capable
      scenarios without launching a browser.
- [ ] A Playwright scenario verifies visible chat/card state and fails if raw
      tool-call markup or `[object Object]`-style object rendering appears.
- [ ] Failure output includes trace, screenshot, DOM excerpt, and result JSON
      paths under a local output directory.
- [ ] Browser tests are gated so normal `pnpm test` does not install/run browser
      binaries unless the command or environment explicitly asks for them.

### Unit 5: Commands, live gates, and bundle handoff

**Story**: `epic-agent-debugging-harness-student-simulation-commands`

**Files**:

- `scripts/student-sim.ts`
- `scripts/student-sim-browser.ts`
- `package.json`
- `tests/student-simulation-cli.test.ts`
- `tests/helpers/student-simulation/report.ts`

```ts
export function generateStudentSimulationReport(input: {
  result: StudentSimulationResult;
}): string;
```

**Implementation notes**:

- Add commands for listing scenarios, running one client scenario, and running
  one browser scenario. Suggested scripts: `student-sim` and
  `student-sim:browser`.
- Live/model-backed scenarios require `PRAXIS_RUN_LIVE_SIMULATION=1`, have an
  explicit `maxTurns`, and record token usage when available. Default commands
  refuse live scenarios with a clear message.
- The report should include scenario id, persona, driver, determinism, first bad
  observation, session/run/call/renderer ids, artifact paths, and the next
  failure-bundle command.
- When a run fails, emit enough information for `pnpm debug:bundle` to capture
  the related session/turn/call and include browser artifact paths.

**Acceptance criteria**:

- [ ] CLI list/run paths work against deterministic scenarios.
- [ ] Live scenarios are skipped/refused unless `PRAXIS_RUN_LIVE_SIMULATION=1`
      is set.
- [ ] Reports include artifact paths and a suggested `debug:bundle` command.
- [ ] The command never mutates `.praxis/dev.db`; temp DB/output paths are
      explicit or generated under `.praxis/debug/simulations/`.

## Implementation Order

1. `epic-agent-debugging-harness-student-simulation-schema`
2. `epic-agent-debugging-harness-student-simulation-client-runner`
3. `epic-agent-debugging-harness-student-simulation-scenarios`
4. `epic-agent-debugging-harness-student-simulation-browser-runner`
5. `epic-agent-debugging-harness-student-simulation-commands`

## Testing

- Unit/type tests for scenario/result schema and artifact mapping.
- Client-runner Vitest tests using `useTempDb()`, scripted engines, and a
  dedicated debug trace registry.
- Scenario catalog tests for lookup, metadata, and the first deterministic
  flows.
- Playwright browser tests behind explicit browser simulation commands or env
  gates; capture trace/screenshot/DOM artifacts on failure.
- CLI smoke tests for list/refuse-live/report behavior without launching a
  browser.

## Risks

- **Browser tier flakiness**: visual checks can become brittle. Mitigate with
  semantic assertions first, screenshot/DOM/trace as evidence, and no golden
  pixel snapshots in v1.
- **Fake-engine fidelity gap**: scripted scenarios cannot prove live-agent
  quality. Mitigate with explicit `determinism` metadata and opt-in live runs.
- **Trace registry overflow**: multi-turn scenarios can exceed the default
  200-record registry. Mitigate with a per-run registry configured for scenario
  size or per-step flushing.
- **Transport drift**: the WebSocket transport is currently a stub, so browser
  v1 must not depend on it. Use a simulation client fixture until a real hosted
  transport exists.
- **Artifact volume**: traces and screenshots can grow quickly. Retain browser
  artifacts only on failure or explicit `keepArtifacts` by default.

## Child stories

- `epic-agent-debugging-harness-student-simulation-schema` - no sibling dependencies.
- `epic-agent-debugging-harness-student-simulation-client-runner` - depends on `epic-agent-debugging-harness-student-simulation-schema`.
- `epic-agent-debugging-harness-student-simulation-scenarios` - depends on `epic-agent-debugging-harness-student-simulation-client-runner`.
- `epic-agent-debugging-harness-student-simulation-browser-runner` - depends on `epic-agent-debugging-harness-student-simulation-scenarios`.
- `epic-agent-debugging-harness-student-simulation-commands` - depends on `epic-agent-debugging-harness-student-simulation-browser-runner`.

## Children Complete (2026-06-01)

All five child stories reached `done`: shared schema, deterministic client
runner, scenario catalog, browser visual runner, and command/report surface.
Feature is ready for review.

## Review (2026-06-01)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Deep feature review completed inline. Fresh-context review was not
used because no authorized different-model reviewer was available in this
session. Checked aggregate behavior across shared simulation types, client
runner, browser runner, scenario catalog, CLI/report surface, live/browser
gates, local artifact paths, and debug-bundle handoff. During review, fixed the
CLI default output location to align with `.praxis/debug/simulations/` and
fixed option-order parsing for value flags before approving. Verification used
the student-simulation Vitest suite, gated Playwright browser simulation,
focused Biome checks, `pnpm typecheck`, and `git diff --check`.
