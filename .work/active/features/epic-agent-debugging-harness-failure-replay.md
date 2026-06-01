---
id: epic-agent-debugging-harness-failure-replay
kind: feature
stage: review
tags: []
parent: epic-agent-debugging-harness
depends_on: [epic-agent-debugging-harness-tooling-research, epic-agent-debugging-harness-trace-correlation]
release_binding: null
gate_origin: null
created: 2026-05-31
updated: 2026-06-01
---

# Failure Bundles And Replay

## Brief

Build the internal mechanism for exporting a failed agent run into a compact evidence bundle and replaying enough of that run to reproduce or inspect the failure. A bundle should collect the relevant trace slice, structured logs, engine events, tool inputs/results, sub-agent activity, episodic rows, selected DB state, and UI-visible outcomes according to the evidence standard chosen by the tooling feature.

Replay should favor deterministic and local execution first: fake engines, recorded event streams, temp DB setup, and existing service/test seams. Where exact live-engine reproduction is not possible, replay should make that explicit and still provide a useful inspection path that shows the stored transcript and tool/UI sequence.

This feature does not create new student behaviors or scenario generation. It consumes trace correlation and produces reusable bundle/replay primitives that synthetic student simulation and debugging runbooks can call.

## Epic context

- Parent epic: `epic-agent-debugging-harness`
- Position in epic: trace consumer and reusable primitive - simulation and runbooks build on the bundle/replay path.

## Foundation references

- `docs/SPEC.md` - local-first data ownership and no telemetry by default.
- `docs/ARCHITECTURE.md` - storage architecture, session data flow, and transport boundaries.
- `docs/CONTRACT.md` - stable event and service contracts for replay input.
- `.agents/skills/patterns/temp-db-test-helper.md` - replay tests must never touch `.praxis/dev.db`.
- `.agents/skills/patterns/service-deps-injection.md` - fake engines and service seams should remain the injection path.

## Design decisions

- **Bundle trigger API**: Use an explicit capture API and repo commands, not
  automatic bundle-on-every-turn capture. The first implementation exposes a
  `DebugBundleCaptureService.capture(...)` service and script-level commands
  that can be called by agents/humans with a `runId`, `sessionId`, `turnId`, or
  `callId`. Automatic capture on every error is deferred until the local bundle
  format proves stable.
- **Full payload source**: Treat `DebugTraceRegistry` as the correlation
  skeleton only. Full `EngineEvent` payloads come from `episodic_events.event_json`
  by session/turn window, because trace records intentionally store compact
  summaries.
- **DB snapshot format**: Use targeted row-level JSON snapshots, not a mini
  SQLite backup and not a full database dump. Replay restore inserts those rows
  into a `useTempDb()` database in FK-safe order.
- **Replay scope**: v1 replay is session-service level. It restores focused DB
  state, wires a deterministic replay engine with recorded events, calls
  `SessionServiceImpl.send(...)`, and reports resulting events/traces. IPC,
  renderer, and browser traces are inspected as artifacts rather than re-run.
- **Browser evidence ownership**: This feature makes browser traces,
  screenshots, and DOM excerpts first-class optional bundle artifacts and emits
  trace-viewer commands when present. `@playwright/test` and live browser
  scenario capture are owned by `epic-agent-debugging-harness-student-simulation`,
  where the browser runner is actually implemented.
- **Default storage**: Local bundles write under
  `.praxis/debug/bundles/<runId>/` by default, with every writer/test accepting
  an explicit output root. Bundle paths are relative inside `manifest.json`.

## Other agent review

A fresh-context advisory pass found the upstream trace work strong but flagged
four design risks that this feature resolves:

- The bundle writer needs an explicit caller and default storage path.
- Full replay payloads must be queried from episodic DB rows, not compact trace
  summaries.
- DB snapshots need a concrete row-JSON restore path into temp databases.
- Replay should be scoped to `SessionServiceImpl` plus deterministic fake engine
  seams for v1; full browser rerun belongs to browser traces and later
  simulation.

The advisory also recommended a multi-turn replay engine and a targeted DB
snapshot story. Both are included below.

## Architectural choice

### Option A: Always-on durable trace recorder

Mirror every trace record and renderer outcome to disk continuously, then build
bundles from the trace spool after a failure. This maximizes post-crash
evidence but adds retention, cleanup, and file I/O policy before the bundle
schema is proven.

### Option B: Post-hoc DB/log-only capture

Build bundles only from persisted episodic rows, selected DB state, and pino
logs. This is simple and survives process restarts, but it loses the compact
tool/sub-agent/IPC/renderer trace skeleton that the upstream trace-correlation
feature just added.

### Option C: Explicit local bundle capture over registry + DB + logs

Provide a capture service that consumes the live `DebugTraceRegistry` when
available, queries full event payloads from the DB, optionally reads pino JSONL
log windows when a log path is configured or supplied, and writes a local
evidence bundle with missing-evidence markers for unavailable sources.

**Chosen**: Option C. It preserves the local-first full-fidelity evidence
standard, avoids always-on browser/log capture, and gives replay/simulation a
stable manifest before adding heavier automation.

## Implementation Units

### Unit 1: Bundle model and writer

**Story**: `epic-agent-debugging-harness-failure-replay-bundle-types`

**Files**:

- `packages/core/src/types/debug-bundle.ts`
- `packages/core/src/types/index.ts`
- `packages/core/src/services/debug/debug-bundle-writer.ts`
- `packages/core/src/services/debug/index.ts`
- `packages/core/src/services/debug/__tests__/debug-bundle-writer.test.ts`

```ts
export type DebugFailureClass =
  | "agent-behavior"
  | "tool-dispatch"
  | "subagent"
  | "ipc"
  | "ui-render"
  | "persistence"
  | "simulation";

export type DebugBundleArtifactKind =
  | "jsonl"
  | "json"
  | "markdown"
  | "sqlite-slice"
  | "trace-zip"
  | "screenshot"
  | "dom-excerpt";

export interface DebugBundleArtifact {
  kind: DebugBundleArtifactKind;
  path: string;
  source:
    | "trace"
    | "session_event"
    | "tool_dispatch"
    | "subagent"
    | "ipc_stream"
    | "renderer"
    | "db_snapshot"
    | "browser_trace"
    | "manual_note";
  capture: "full_local" | "full_local_sensitive" | "metadata_only";
  description?: string;
}

export interface DebugBundleManifest {
  kind: "debug_evidence_bundle";
  schemaVersion: 1;
  runId: string;
  createdAt: string;
  localOnly: true;
  exportKind: "none";
  session?: { sessionId: string; modeId?: string; engineId?: string };
  correlation: {
    turnIds: string[];
    callIds: string[];
    parentCallIds: string[];
    streamIds: string[];
    rendererEventIds: string[];
  };
  artifacts: DebugBundleArtifact[];
  captureEvents: Array<{
    type: "evidence_captured" | "evidence_missing";
    source: DebugBundleArtifact["source"];
    reason?: string;
    artifactPath?: string;
  }>;
  summary: {
    title: string;
    failureClass: DebugFailureClass;
    firstBadObservation?: string;
    nextDebugStep?: string;
  };
}

export interface DebugBundleWriter {
  write(input: {
    outputDir: string;
    manifest: DebugBundleManifest;
    artifacts: readonly { path: string; contents: string | Uint8Array }[];
  }): Promise<{ bundleDir: string; manifestPath: string }>;
}
```

**Implementation notes**:

- Manifest artifact paths must be relative to the bundle root. Reject absolute
  artifact paths and `..` traversal in writer inputs.
- The writer creates directories recursively and writes `manifest.json` last so
  partial bundle writes are obvious.
- The writer is pure filesystem infrastructure; it does not query DB or infer
  evidence.

**Acceptance criteria**:

- [ ] Bundle manifest and artifact types compile from `@praxis/core/types`.
- [ ] Writer rejects absolute/traversal artifact paths.
- [ ] Writer round-trips a minimal manifest plus JSONL artifact in tests.
- [ ] Browser trace artifact kinds exist without adding a Playwright dependency.

### Unit 2: Trace and episodic capture service

**Story**: `epic-agent-debugging-harness-failure-replay-capture-slices`

**Files**:

- `packages/core/src/services/debug/debug-bundle-capture-service.ts`
- `packages/core/src/services/debug/debug-log-reader.ts`
- `packages/core/src/services/debug/index.ts`
- `packages/core/src/services/index.ts`
- `packages/core/src/services/types.ts`
- `packages/core/src/services/debug/__tests__/debug-bundle-capture-service.test.ts`

```ts
export interface DebugBundleCaptureInput {
  runId?: string;
  sessionId?: SessionId;
  turnId?: string;
  callId?: string;
  failureClass: DebugFailureClass;
  title: string;
  firstBadObservation?: string;
  nextDebugStep?: string;
  outputRoot?: string;
  logFilePath?: string;
}

export interface DebugBundleCaptureService {
  capture(input: DebugBundleCaptureInput): Promise<{
    bundleDir: string;
    manifestPath: string;
    manifest: DebugBundleManifest;
  }>;
}
```

**Implementation notes**:

- Capture query priority: explicit `runId`, then `turnId`, then `callId`, then
  `sessionId`. The service may widen from a call/turn to the containing session
  window so the bundle has enough context.
- Write `trace-records.jsonl` from `DebugTraceRegistry` records when available.
  If the registry has no matching records, write an `evidence_missing` capture
  event instead of failing.
- Write `engine-events.jsonl` from `episodic_events.event_json`, including
  event id, timestamp, session id, turn index, mode id, and engine id.
- Split trace-derived records into `tool-dispatch.jsonl`,
  `subagent-timeline.jsonl`, `ipc-streams.jsonl`, and
  `renderer-outcomes.jsonl` for agent-readable inspection. These files can be
  empty only if the manifest records why the evidence was absent.
- `DebugLogReader` is an optional port over pino JSONL files. When a log path is
  absent, the capture service records missing log evidence rather than blocking.
- Add optional `debugBundles?: DebugBundleCaptureService` to `ServiceDeps` only
  if tool or service consumers need it. Avoid making existing tests wire it.

**Acceptance criteria**:

- [ ] Capturing by `sessionId` writes trace records when present and episodic
      event payloads from the DB.
- [ ] Capturing by `callId` includes the matching tool dispatch records and the
      surrounding session/turn event slice.
- [ ] Missing trace/log evidence is explicit in the manifest and does not fail
      the capture.
- [ ] Renderer outcome records appear in `renderer-outcomes.jsonl` with
      `sessionId`, `callId`, and `rendererEventId` where available.

### Unit 3: Focused DB snapshot and restore plan

**Story**: `epic-agent-debugging-harness-failure-replay-db-snapshot`

**Files**:

- `packages/core/src/services/debug/debug-db-snapshot.ts`
- `packages/core/src/services/debug/__tests__/debug-db-snapshot.test.ts`
- `packages/core/src/services/debug/debug-bundle-capture-service.ts`

```ts
export interface DebugDbSnapshot {
  schemaVersion: 1;
  tables: Array<{
    name: string;
    rows: readonly Record<string, unknown>[];
  }>;
  relationships: Array<{
    kind: "present" | "missing";
    table: string;
    id: string;
    reason?: string;
  }>;
}

export interface DebugDbSnapshotter {
  capture(input: { sessionId?: SessionId; callIds?: readonly string[] }): Promise<DebugDbSnapshot>;
  restore(input: { snapshot: DebugDbSnapshot; db: PraxisDb }): Promise<void>;
}
```

**Implementation notes**:

- Start with focused tables that explain the motivating failures:
  `sessions`, `episodic_events`, `document_scopes`, `documents`, `drafts`,
  `courses`, `assignments`, and assignment response rows when an assignment is
  in scope.
- Do not dump all document chunks or the whole DB. Include FK/relationship
  presence summaries when a row is intentionally omitted.
- Restore inserts rows in dependency order and is intended for `useTempDb()`
  tests and replay fixtures, not for mutating a user DB.

**Acceptance criteria**:

- [ ] Snapshot includes the session row and matching episodic rows for a
      session-scoped capture.
- [ ] Document-scope FK/polymorphic relationship presence is represented for
      course-create/session failures.
- [ ] Restore into a temp DB preserves enough relationships for
      `SessionServiceImpl` and replay tests to run.
- [ ] Snapshot tests never touch `.praxis/dev.db`.

### Unit 4: Deterministic replay engine and runner

**Story**: `epic-agent-debugging-harness-failure-replay-runner`

**Files**:

- `tests/helpers/replay-engine.ts`
- `tests/helpers/replay-runner.ts`
- `tests/failure-replay-end-to-end.test.ts`
- `packages/core/src/services/debug/debug-bundle-loader.ts`
- `packages/core/src/services/debug/__tests__/debug-bundle-loader.test.ts`

```ts
export interface ReplayTurn {
  turnIndex: number;
  userMessage: string;
  events: readonly EngineEvent[];
}

export class ReplayEngine implements Engine {
  constructor(input: { id?: string; turns: readonly ReplayTurn[] });
}

export async function replayDebugBundle(input: {
  bundleDir: string;
  dbPath: string;
}): Promise<{
  yieldedEvents: readonly EngineEvent[];
  traceRecords: readonly DebugTraceRecord[];
  episodicRows: readonly unknown[];
}>;
```

**Implementation notes**:

- `ReplayEngine` is test/debug infrastructure, not a production engine adapter.
  It returns the recorded event sequence for each replayed turn and fails fast
  if the caller asks for an unavailable turn.
- `replayDebugBundle(...)` loads manifest, DB snapshot, and engine event JSONL,
  restores a temp DB, builds `SessionServiceImpl` with `engineFactory`, then
  runs the recorded user message through the service pipeline.
- Replay must state limitations in the returned report: external model behavior,
  vector search contents, file-system document assets, timings, and renderer DOM
  state are not re-executed in session-service replay.

**Acceptance criteria**:

- [ ] Replay engine supports multi-turn bundles deterministically.
- [ ] Replay runner restores a bundle into a temp DB and replays through
      `SessionServiceImpl` without live model calls.
- [ ] A regression fixture for the course-create FK-before-subagent failure
      proves the replay can show tool failure and expected-but-absent sub-agent
      evidence.
- [ ] Replay failure messages name missing turns/artifacts instead of silently
      falling back to live behavior.

### Unit 5: Inspection report, commands, and browser artifact handoff

**Story**: `epic-agent-debugging-harness-failure-replay-report-commands`

**Files**:

- `packages/core/src/services/debug/debug-bundle-report.ts`
- `packages/core/src/services/debug/__tests__/debug-bundle-report.test.ts`
- `scripts/debug-bundle.ts`
- `scripts/debug-replay.ts`
- `package.json`

```ts
export function generateDebugBundleReport(input: {
  manifest: DebugBundleManifest;
  artifacts: readonly { path: string; contents: string }[];
}): string;
```

**Implementation notes**:

- `debug-bundle.ts` captures a bundle from the local DB/log context:
  `pnpm tsx scripts/debug-bundle.ts --session <id> --failure-class <class> --title <title>`.
- `debug-replay.ts` loads a bundle and prints a compact replay/inspection
  summary. It should not mutate `.praxis/dev.db`; replay uses temp DB paths.
- The report should include failure class, first bad observation, run/session/
  turn/call/stream/renderer ids, artifact list, missing evidence, likely owner,
  next debug step, and browser trace viewer commands when `trace-zip` artifacts
  exist.
- Browser artifacts are pointers only in this feature. The report may say
  `pnpm exec playwright show-trace <path>` when a trace exists, but adding
  Playwright and producing traces belongs to the student-simulation feature.

**Acceptance criteria**:

- [ ] Report generation produces concise Markdown for a minimal bundle.
- [ ] Commands can capture/load/replay against temp fixtures in tests or smoke
      checks without touching `.praxis/dev.db`.
- [ ] Browser trace artifacts appear in the manifest/report when present.
- [ ] The report maps symptoms to package owners enough for the later runbook
      skill to point agents at concrete files.

## Implementation Order

1. `epic-agent-debugging-harness-failure-replay-bundle-types`
2. `epic-agent-debugging-harness-failure-replay-capture-slices`
3. `epic-agent-debugging-harness-failure-replay-db-snapshot`
4. `epic-agent-debugging-harness-failure-replay-runner`
5. `epic-agent-debugging-harness-failure-replay-report-commands`

## Testing

- Unit tests for manifest validation, relative path enforcement, bundle writer
  output, capture query narrowing, log-reader missing-evidence behavior, DB
  snapshot serialize/restore, replay engine turn selection, loader validation,
  and report generation.
- Integration test under `tests/failure-replay-end-to-end.test.ts` using
  `useTempDb()` and `ReplayEngine`.
- Script smoke tests should pass explicit temp DB/output paths and must not use
  default `.praxis/dev.db`.
- Existing focused trace tests remain relevant:
  `packages/core/src/services/__tests__/session-service.debug-trace.test.ts`,
  `packages/desktop/electron/main/__tests__/session-channel-trace.test.ts`,
  and `packages/desktop/electron/main/__tests__/log-channel.test.ts`.

## Risks

- **Live trace registry is bounded**: a very noisy turn can evict old compact
  trace records. Mitigation: full event payloads come from episodic DB rows, and
  missing compact trace evidence is explicit in the manifest.
- **Replay can look more deterministic than reality**: session-service replay
  does not reproduce live model behavior, renderer layout, vector-store contents,
  or timing races. Mitigation: reports name those limits and browser artifacts
  remain separate evidence.
- **DB snapshot can grow without discipline**: full DB dumps are tempting.
  Mitigation: row-level JSON snapshots are scoped to known tables and
  relationship summaries.
- **Browser replay could be split across features**: failure-replay only owns
  artifact vocabulary and report commands. Student-simulation owns Playwright
  dependency and live browser trace production.

## Child stories

- `epic-agent-debugging-harness-failure-replay-bundle-types` - no sibling dependencies.
- `epic-agent-debugging-harness-failure-replay-capture-slices` - depends on `epic-agent-debugging-harness-failure-replay-bundle-types`.
- `epic-agent-debugging-harness-failure-replay-db-snapshot` - depends on `epic-agent-debugging-harness-failure-replay-capture-slices`.
- `epic-agent-debugging-harness-failure-replay-runner` - depends on `epic-agent-debugging-harness-failure-replay-db-snapshot`.
- `epic-agent-debugging-harness-failure-replay-report-commands` - depends on `epic-agent-debugging-harness-failure-replay-runner`.

## Children Complete (2026-06-01)

All five implementation stories are at `stage: done`; feature advanced to
`stage: review`.
