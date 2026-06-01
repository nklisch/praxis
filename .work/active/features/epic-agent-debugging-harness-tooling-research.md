---
id: epic-agent-debugging-harness-tooling-research
kind: feature
stage: done
tags: []
parent: epic-agent-debugging-harness
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-31
updated: 2026-06-01
---

# Tooling Research

## Brief

Select the debugging harness's evidence standard and supporting tool stack through current-source research, without locking the epic into a guessed vendor or framework. This feature should compare trace/logging, browser automation, replay, and agent-evaluation options against Praxis's local-first ownership stance, full-fidelity local debug evidence needs, TypeScript monorepo shape, Electron deployment, and existing pino/Vitest/testing-library foundations.

The deliverable is a durable decision record inside this item and any needed `docs/research/` notes, not a production implementation. It should decide what gets built in-house, what existing dependency is enough, and where a new dependency is justified. Downstream features depend on this because they need a stable vocabulary for trace events, failure bundles, replay inputs, and simulation outcomes.

This feature does not implement the trace pipeline, replay runner, or student simulator. It only defines the criteria, researches the options, and records the chosen direction so the implementation features can stay concrete.

## Epic context

- Parent epic: `epic-agent-debugging-harness`
- Position in epic: foundation feature - every implementation feature consumes its tool and evidence decisions.

## Foundation references

- `docs/SPEC.md` - local data ownership, local-first telemetry default, testing stack, and rejected "agent framework as foundation" constraint.
- `docs/ARCHITECTURE.md` - agent harness, engine adapters, transport, and package boundaries.
- `docs/CONTRACT.md` - engine events, tool registry, sub-agent, and IPC contracts.

## UI alignment

No mockups for this feature. The parent epic keeps v1 output as research notes, item-body decision records, command/report conventions, and internal harness contracts rather than a net-new app screen. If downstream work adds a visual trace viewer inside Praxis, that later feature should run the mockup workflow.

## Design decisions

- **Question checkpoint**: No unresolved user-facing direction question remains for this feature. The parent epic already pins the audience, local-first stance, replay-plus-simulation shape, and evidence categories; this feature designs the research work needed to turn those into concrete decisions.
- **Official-source standard**: External tooling claims must cite current official docs or first-party repositories. This is required because browser automation, LLM observability, and agent-evaluation tooling change quickly.
- **Dependency posture**: Do not mutate `package.json` in this feature unless the final decision record explicitly proves a small research-only validation dependency is necessary. Implementation features should add production dependencies after this feature chooses the direction.
- **Telemetry posture**: Treat hosted observability/evaluation platforms as candidates or optional export targets, not as the primary source of truth. Praxis's first evidence format must work locally with full-fidelity capture available for debug runs; sanitization belongs to explicit export/share paths.

## Architectural choice

### Option A: Vendor-first LLM observability platform

Adopt a platform such as Phoenix, Langfuse, or Braintrust as the primary trace and evaluation store, then shape Praxis harness output around that platform's trace/eval model. This optimizes for rich existing UIs and agent-eval workflows, but it fights the local-first telemetry default and would force downstream code to inherit a vendor-shaped contract before Praxis has its own evidence standard.

### Option B: OpenTelemetry-first instrumentation

Use OpenTelemetry spans as the first-class trace representation across session, tool, sub-agent, IPC, and renderer layers. This optimizes for vendor-neutral propagation and future export, but current OpenTelemetry JavaScript docs mark browser instrumentation as experimental and logs as still in development. It is a useful vocabulary and bridge, not the lowest-risk source of truth for this Electron-local harness.

### Option C: Praxis-native evidence standard with optional adapters

Define a small Praxis evidence bundle first, grounded in existing `EngineEvent`, pino log records, tool dispatch `callId`s, `SubAgentRegistry` events, IPC stream events, Vitest/FakeEngine fixtures, and browser traces where adopted. External tools become optional capture or export adapters. This optimizes for local reproducibility, full-fidelity local ownership, and compatibility with current package boundaries while leaving room for Playwright/Vitest Browser Mode and OpenTelemetry-compatible exports.

**Chosen**: Option C. The feature is a research-and-decision slice, so the durable output should be a Praxis-native vocabulary plus a tool decision table. Downstream implementation features can then add adapters without making the whole harness depend on a third-party observability stack.

## Current-source starting points

- Playwright Trace Viewer records test actions and lets developers inspect logs, source, network, errors, console output, and DOM snapshots in a trace. Source: <https://playwright.dev/docs/trace-viewer-intro>
- Vitest Browser Mode can run tests in a real browser and recommends a Playwright provider for CI-capable browser testing; its trace view support is Playwright-provider-specific. Source: <https://vitest.dev/guide/browser/>
- OpenTelemetry JavaScript supports Node.js and browser usage, with traces and metrics stable but logs still marked development and browser client instrumentation experimental. Source: <https://opentelemetry.io/docs/languages/js/>
- Phoenix, Langfuse, and Braintrust all cover some mix of AI tracing, datasets, evaluations, and experiments; evaluate them as references or optional exports before any dependency choice. Sources: <https://arize.com/docs/phoenix>, <https://langfuse.com/docs/observability/overview>, <https://www.braintrust.dev/docs/evaluate>

## Implementation Units

### Unit 1: Current-source tooling survey

**File**: `docs/research/agent-debugging-tooling.md`
**Story**: `epic-agent-debugging-harness-tooling-research-current-source-survey`

```markdown
# Agent Debugging Tooling Research

## Criteria

| Criterion | Why it matters for Praxis |
|---|---|
| Local-first by default | Must not send student data, prompts, traces, or screenshots off-device unless explicitly opted in. |
| TypeScript/Electron fit | Must work with the pnpm monorepo, Electron main/renderer split, Node 24+, and existing Vitest setup. |
| Evidence coverage | Must help inspect engine events, tool calls/results, sub-agent steps, IPC streams, UI output, logs, DB state, and browser traces. |
| Replay support | Must produce artifacts another agent can consume without chat-history archaeology. |
| Capture and retention | Must preserve enough local detail to debug visual/agent failures, support bounded local artifacts, and sanitize only for explicit export or sharing. |

## Candidate matrix

| Candidate | Category | Official source | Fit | Decision | Notes |
|---|---|---|---|---|---|
| pino / current logger | logging | <source> | <fit> | adopt/defer/reject | <why> |
| OpenTelemetry JS | trace vocabulary/export | <source> | <fit> | adopt/defer/reject | <why> |
| Playwright | browser automation/trace | <source> | <fit> | adopt/defer/reject | <why> |
| Vitest Browser Mode | component/browser tests | <source> | <fit> | adopt/defer/reject | <why> |
| Phoenix | AI observability/evals | <source> | <fit> | adopt/defer/reject | <why> |
| Langfuse | AI observability/evals | <source> | <fit> | adopt/defer/reject | <why> |
| Braintrust | AI evals/experiments | <source> | <fit> | adopt/defer/reject | <why> |

## Recommendation summary

- **Build in-house**: <local evidence bundle / trace correlation / replay manifest decisions>
- **Use existing dependency**: <pino / Vitest / Testing Library decisions>
- **Add dependency if justified**: <Playwright or Vitest browser provider decision>
- **Optional export only**: <OTel / AI observability platform decisions>
```

**Implementation Notes**:

- The survey must cite official docs or first-party repos only for API/tooling claims.
- Separate "use as design reference" from "add as dependency"; those are different decisions.
- Include license/deployment/data-flow notes when a tool stores data outside the local machine or requires a running service.
- Explicitly compare `@playwright/test` against `@vitest/browser-playwright` for the UI/browser slice; do not assume one just because Playwright traces are attractive.

**Acceptance Criteria**:

- [ ] `docs/research/agent-debugging-tooling.md` exists with criteria, candidate matrix, and recommendation summary.
- [ ] Every external-tool row includes an official-source link and a dated/accessed note.
- [ ] The survey identifies what to build in-house, what existing Praxis dependencies already cover, and where a new dependency is justified or deferred.
- [ ] The survey does not recommend any default behavior that exports prompts, screenshots, student data, or traces off-device.

### Unit 2: Evidence standard and bundle vocabulary

**File**: `.work/active/features/epic-agent-debugging-harness-tooling-research.md`
**Story**: `epic-agent-debugging-harness-tooling-research-evidence-standard`

```typescript
type DebugEvidenceSource =
  | "session_event"
  | "tool_dispatch"
  | "subagent"
  | "ipc_stream"
  | "renderer"
  | "db_snapshot"
  | "browser_trace"
  | "simulation_step"
  | "manual_note";

type DebugEvidenceDecision = "required" | "optional" | "out_of_scope";

interface DebugEvidenceFieldSketch {
  source: DebugEvidenceSource;
  decision: DebugEvidenceDecision;
  capture: "full_local" | "full_local_sensitive" | "metadata_only" | "sanitize_on_export";
  retention: "bundle" | "pointer" | "summary_only";
  downstreamConsumer:
    | "trace-correlation"
    | "failure-replay"
    | "student-simulation"
    | "debug-runbooks";
}

interface DebugEvidenceBundleSketch {
  schemaVersion: 1;
  runId: string;
  createdAt: string;
  localOnly: boolean;
  session?: {
    sessionId: string;
    modeId: string;
    engineId: string;
  };
  correlation: {
    traceId?: string;
    turnId?: string;
    callIds: string[];
    streamIds: string[];
  };
  evidence: DebugEvidenceFieldSketch[];
  artifacts: Array<{
    kind: "jsonl" | "sqlite-slice" | "trace-zip" | "screenshot" | "markdown";
    path: string;
    capture: DebugEvidenceFieldSketch["capture"];
  }>;
  summary: {
    title: string;
    failureClass:
      | "agent-behavior"
      | "tool-dispatch"
      | "subagent"
      | "ipc"
      | "ui-render"
      | "persistence"
      | "simulation";
    firstBadObservation?: string;
    nextDebugStep?: string;
  };
}
```

**Implementation Notes**:

- This is a decision-record sketch, not production code. If downstream implementation promotes it to code, the likely home is `@praxis/core` shared types because replay, simulation, and reports all need the same vocabulary.
- Required fields should align with existing contracts: `EngineEvent.callId`, `ToolContext.callId`, `SubAgentRegistry` parent call IDs, IPC stream IDs, pino child bindings, and session IDs.
- The standard should state whether prompt/message content is stored, summarized, pointed to, or sanitized only in an explicit export/share derivative. Default local debug bundles can be full-fidelity when a debug run asks for that evidence.
- The standard must be usable by an agent reading a bundle without running the app: include a concise failure summary and pointers to evidence artifacts.

**Acceptance Criteria**:

- [ ] The feature item contains a `## Evidence standard` section with required/optional/out-of-scope evidence fields.
- [ ] The standard maps each evidence field to a downstream consumer and a capture/retention/sharing policy.
- [ ] The standard explicitly covers the motivating failures: raw tool-call markup in chat, `course.start_drafting` FK failure before sub-agent launch, and React crash on structured tool summary object rendering.
- [ ] The standard identifies which fields are stable enough for downstream implementation and which remain research notes.

## Evidence standard

Praxis will build a native local evidence bundle first. The bundle is a bounded
directory of full-fidelity JSON/JSONL/markdown artifacts plus optional SQLite
slices, screenshots, DOM excerpts, and browser trace pointers. Because Praxis is
a local open-source project and these artifacts do not leave the user's machine
by default, sanitization is an export/sharing concern rather than a local capture
requirement.

The standard's job is to let another agent debug a failed tutoring run from disk
without chat-history archaeology. Local debug bundles should capture the exact
prompt/message/model/tool/UI evidence needed to explain the failure when a debug
run asks for it. A separate explicit export/share step may write a sanitized
derivative bundle for off-machine transfer, and that derivative must say what it
removed. OpenTelemetry terms such as `traceId` and `spanId` are vocabulary only
for v1 and must not become a runtime dependency in this research slice. Phoenix,
Langfuse, Braintrust, and LangSmith are references or future export targets, not
default evidence stores.

### Evidence field decisions

Required fields are stable enough for downstream implementation. Optional fields
are allowed in bundles when a downstream story captures the artifact, but
consumers must handle absence. Out-of-scope fields are research notes or future
export concerns and must not be required by trace-correlation, failure-replay,
student-simulation, or debug-runbooks.

#### Required evidence

| Field | Source/category | Contains | Stable identifiers / correlation IDs | Local capture / sharing policy | Retention policy | Downstream consumers |
|---|---|---|---|---|---|---|
| Bundle manifest | `manual_note` / stored manifest | `schemaVersion`, `runId`, `createdAt`, capture reason, local-only flag, artifact list, capture policy, and failure summary. | `runId` is bundle-local and stable; artifact entries use relative paths within the bundle. | Full local manifest; sanitized export manifests must identify removed or summarized artifacts. | Retain in bundle. | trace-correlation, failure-replay, student-simulation, debug-runbooks |
| Session and turn metadata | `session_event` | Session id, mode id, engine id, turn id when available, final reason, first bad observation, and visible surface label. | `sessionId`, `turnId`, optional engine event sequence number. | Full local metadata and message pointers; exports may summarize message content. | Retain in bundle as JSONL slice plus summary. | trace-correlation, failure-replay, debug-runbooks |
| Engine event slice | `session_event` | `EngineEvent` stream around the failure, especially `model_message`, `tool_call`, `tool_result`, `error`, `final`, and `interrupted`. | `sessionId`, `turnId`, `callId` for `tool_call`/`tool_result`; optional `traceId`. | Full local event payloads when captured; exports may keep event type/tool/error shape and sanitize prompt or result content. | Retain bounded JSONL window in bundle. | trace-correlation, failure-replay, debug-runbooks |
| Tool dispatch record | `tool_dispatch` | Registry dispatch start/ok/error facts: tool name, validated args, result/error, serialized error, duration, and handler tier. | `callId` from `ToolDispatchMeta` into `ToolContext.callId`, `sessionId`, `turnId`, optional `spanId`. | Full local args/results/errors when needed; exports may preserve schema shape, validation errors, error code/message, and duration only. | Retain bounded JSONL plus manifest summary. | trace-correlation, failure-replay, debug-runbooks |
| Sub-agent timeline | `subagent` | `SubAgentRegistry` snapshots/events for parent tool calls: started, step_started, step_settled, phase/status changes, finished/interrupted/failed. Absence is itself evidence when a parent tool fails before `start(...)`. | `sessionId`, `parentCallId`, sub-agent step `callId`, optional stream id from IPC fanout. | Full local step messages/status when captured; exports may keep names/status/timings only. | Retain bounded JSONL; include an explicit `observed: false` marker for expected-but-absent sub-agent starts. | trace-correlation, failure-replay, debug-runbooks |
| IPC stream record | `ipc_stream` | Start/events/done/error/cancel envelope facts for relevant stream families, especially session stream and `praxis.subAgent.events.*`. | `streamId`, channel base, `sessionId` where arguments provide it, `parentCallId` for filtered sub-agent streams. | Full local envelope payloads when captured; exports may keep envelope `kind`, channel, count, duration, and error summary. | Retain bounded JSONL. | trace-correlation, failure-replay, student-simulation, debug-runbooks |
| Renderer failure record | `renderer` | Surface/component name, route/session tab, renderer error message, component stack/JS stack when available, rendered data, and visible UI outcome. | `rendererEventId`, `sessionId`, `streamId` if tied to an IPC stream, optional `callId` if caused by a tool result. | Full local render/error evidence; exports may sanitize stack paths and prompt/student-visible content. | Retain in bundle as JSON/markdown summary and pino renderer log slice. | trace-correlation, failure-replay, student-simulation, debug-runbooks |
| Persistence scope snapshot | `db_snapshot` | Local DB state needed to explain a failure: ids and relationship presence for sessions, documents, document scopes, drafts, assignments, courses, and relevant FK parent rows. | `sessionId`, `documentId`, `scopeKind`, `scopeId`, `draftId`, `courseId`, `assignmentId` where present. | Prefer focused local slices over whole-DB dumps; exports may summarize table names, ids, counts, and FK presence. | Retain as summary JSON or targeted SQLite slice only when needed. | trace-correlation, failure-replay, debug-runbooks |
| Log slice | `manual_note` / pino JSONL | Local pino records around the failure, including child bindings such as component, stream id, call id, session id, and serialized errors. | pino child bindings: `component`, `streamId`, `callId`, `sessionId`, optional `runId`. | Full local log window where available; exports may produce a sanitized copy. | Retain bounded JSONL window in bundle; do not require global log retention. | trace-correlation, failure-replay, debug-runbooks |

#### Optional evidence

| Field | Source/category | Contains | Stable identifiers / correlation IDs | Local capture / sharing policy | Retention policy | Downstream consumers |
|---|---|---|---|---|---|---|
| Browser trace artifact | `browser_trace` | Playwright or Vitest Browser Mode trace zip, console, network, errors, DOM snapshots, and screenshots when a downstream browser story captures them. | `runId`, optional `browserRunId`, `sessionId`, route, related `streamId`/`callId` when known. | Full local trace artifact; off-machine sharing requires an explicit sanitized derivative or deliberate raw export. | Pointer in manifest; retain only on failure or explicit capture by default. | failure-replay, student-simulation, debug-runbooks |
| Screenshot or DOM excerpt | `renderer` / `browser_trace` | Visual/DOM proof of visible UI outcome, such as raw markup shown in chat or an error boundary state. | `runId`, `sessionId`, `rendererEventId`, optional browser trace timestamp. | Full local evidence for visual anomalies; exports may crop or summarize. | Pointer or excerpt in local bundle. | failure-replay, student-simulation, debug-runbooks |
| Simulation step transcript | `simulation_step` | Scripted student action, expected outcome, observed outcome, model/tool result, and browser/test harness step status. | `runId`, `simulationId`, `stepId`, optional `streamId`, `callId`, and browser trace timestamp. | Full local transcript for failed scenarios; exports may summarize persona text and model/tool content. | Retain in bundle when student-simulation creates it. | student-simulation, failure-replay, debug-runbooks |
| Human annotation | `manual_note` | Reviewer note, suspected root cause, next debug step, and links to work items. | `runId`, optional item id, commit sha, artifact path. | Author controls local content; exports should state whether the note was sanitized. | Retain in bundle and item body when relevant. | debug-runbooks |
| Vendor/export mapping | `manual_note` | Optional mapping to OpenTelemetry, Phoenix, Langfuse, Braintrust, or LangSmith concepts. | `runId`, optional `traceId`/`spanId`. | Export is explicit and separate from local capture. | Summary-only unless an export adapter writes its own artifact. | trace-correlation, debug-runbooks |

#### Out-of-scope evidence

| Field | Source/category | Contains | Stable identifiers / correlation IDs | Local capture / sharing policy | Retention policy | Downstream consumers |
|---|---|---|---|---|---|---|
| Default hosted trace export | External observability store | Prompt/tool/renderer evidence sent to Phoenix, Langfuse, Braintrust, LangSmith, OTLP, Sentry, Datadog, or similar by default. | Vendor-specific trace ids. | Out of scope because evidence must stay local unless the user explicitly exports it. | Do not emit by default. | None by default |
| Full database dump | `db_snapshot` | Entire local Praxis DB or document corpus. | All local ids. | Out of scope for v1 because targeted slices are enough for known failures and are easier for agents to inspect. | Do not retain in normal bundles. | None by default |
| Always-on browser recording | `browser_trace` | Continuous DOM/screenshot/network traces outside targeted test or debug runs. | Browser-run-specific ids. | Out of scope because it is noisy and expensive; targeted trace capture is the v1 path. | Do not retain. | None by default |
| Implicit off-machine export | External sharing path | Any evidence bundle uploaded or copied outside the local machine without an explicit user action. | Export-specific ids. | Out of scope; export adapters must be opt-in and clear about raw vs sanitized output. | Do not emit by default. | None by default |

### TypeScript vocabulary sketch

This sketch is a decision-record artifact, not production code. If downstream
implementation promotes it, the likely home is shared `@praxis/core` types so
trace-correlation, replay, simulation, and runbook reports consume one
vocabulary. It follows Praxis discriminator conventions: `type` names streamed
events and `kind` names stored object variants.

```typescript
type DebugEvidenceSource =
  | "session_event"
  | "tool_dispatch"
  | "subagent"
  | "ipc_stream"
  | "renderer"
  | "db_snapshot"
  | "browser_trace"
  | "simulation_step"
  | "manual_note";

type DebugEvidenceDecision = "required" | "optional" | "out_of_scope";
type DebugEvidenceStability = "stable" | "research_only";

type DebugEvidenceConsumer =
  | "trace-correlation"
  | "failure-replay"
  | "student-simulation"
  | "debug-runbooks";

type DebugEvidenceCapturePolicy =
  | "full_local"
  | "full_local_sensitive"
  | "metadata_only"
  | "sanitize_on_export"
  | "do_not_capture";

type DebugEvidenceRetention =
  | "bundle"
  | "bounded_jsonl_window"
  | "pointer"
  | "summary_only"
  | "do_not_retain";

interface DebugEvidenceFieldSketch {
  kind: "evidence_field";
  name: string;
  source: DebugEvidenceSource;
  decision: DebugEvidenceDecision;
  stability: DebugEvidenceStability;
  contains: string;
  correlationIds: Array<
    | "runId"
    | "sessionId"
    | "turnId"
    | "callId"
    | "parentCallId"
    | "streamId"
    | "rendererEventId"
    | "documentId"
    | "scopeId"
    | "draftId"
    | "traceId"
    | "spanId"
  >;
  capture: DebugEvidenceCapturePolicy;
  retention: DebugEvidenceRetention;
  downstreamConsumers: DebugEvidenceConsumer[];
}

type DebugBundleArtifactSketch =
  | {
      kind: "jsonl";
      path: string;
      source: DebugEvidenceSource;
      capture: DebugEvidenceCapturePolicy;
    }
  | {
      kind: "sqlite-slice";
      path: string;
      source: "db_snapshot";
      capture: DebugEvidenceCapturePolicy;
    }
  | {
      kind: "trace-zip";
      path: string;
      source: "browser_trace";
      capture: "full_local_sensitive" | "sanitize_on_export";
    }
  | {
      kind: "screenshot";
      path: string;
      source: "renderer" | "browser_trace";
      capture: DebugEvidenceCapturePolicy;
    }
  | {
      kind: "markdown";
      path: string;
      source: "manual_note";
      capture: DebugEvidenceCapturePolicy;
    };

type DebugBundleEventSketch =
  | {
      type: "evidence_captured";
      runId: string;
      fieldName: string;
      artifactPath?: string;
    }
  | {
      type: "evidence_missing";
      runId: string;
      fieldName: string;
      expectedCorrelationId: string;
      reason:
        | "not_observed"
        | "not_enabled"
        | "sanitized_for_export"
        | "capture_failed";
    };

interface DebugEvidenceBundleSketch {
  kind: "debug_evidence_bundle";
  schemaVersion: 1;
  runId: string;
  createdAt: string;
  localOnly: boolean;
  exportKind?: "none" | "sanitized" | "raw_explicit";
  session?: {
    sessionId: string;
    modeId: string;
    engineId: string;
  };
  correlation: {
    traceId?: string;
    turnId?: string;
    callIds: string[];
    parentCallIds: string[];
    streamIds: string[];
    rendererEventIds: string[];
  };
  fields: DebugEvidenceFieldSketch[];
  artifacts: DebugBundleArtifactSketch[];
  captureEvents: DebugBundleEventSketch[];
  summary: {
    title: string;
    failureClass:
      | "agent-behavior"
      | "tool-dispatch"
      | "subagent"
      | "ipc"
      | "ui-render"
      | "persistence"
      | "simulation";
    firstBadObservation?: string;
    visibleUiOutcome?: string;
    nextDebugStep?: string;
  };
}
```

### Motivating failure coverage

- Raw tool-call markup leaked into course-create chat: required evidence is the
  engine event slice (`model_message` content plus nearby `tool_call` and
  `tool_result` events), session/turn metadata, renderer surface outcome, and
  optional screenshot/DOM excerpt if a browser trace captures the exact visible
  `<invoke ...>` text. The stable fields are `sessionId`, `turnId`, event
  `type`, `callId`, mode id, and renderer surface.
- `course.start_drafting` hit `SQLITE_CONSTRAINT_FOREIGNKEY` before the drafter
  could start: required evidence is the `course.start_drafting` tool dispatch
  args/result/error, `callId`, session id, document-scope ids and FK presence
  summary, pino log slice with serialized error, and sub-agent evidence that
  records either the matching `parentCallId` timeline or an explicit
  expected-but-absent sub-agent start. This makes "tool failed before
  `SubAgentRegistry.start(...)`" distinguishable from "sub-agent started and
  then failed."
- React crashed with "Objects are not valid as a React child" when a structured
  tool summary object was rendered: required evidence is the full local tool
  result shape, renderer error message and stack/component stack, component or
  surface name, session/stream/call correlation, and visible UI outcome.
  Optional browser trace or screenshot evidence can show whether an error
  boundary, blank tab, or partially rendered chat was visible.

### Stable vs research-only

Stable for downstream implementation: bundle manifest, `runId`, `sessionId`,
`turnId` where available, `callId`, `parentCallId`, `streamId`, renderer event id,
artifact manifest paths, evidence decision/capture/retention fields, pino log
slices, `EngineEvent` slices, tool dispatch records, sub-agent timeline or
explicit absence marker, IPC envelope facts, renderer failure records, focused DB
relationship snapshots, and explicit export/share policy.

Optional/research-only for now: OpenTelemetry `traceId`/`spanId` export semantics,
Playwright/Vitest Browser Mode trace zip artifacts, screenshot/DOM excerpt
formats, simulation-step transcript schema, vendor export mappings, and any
platform-specific dataset/evaluation vocabulary from Phoenix, Langfuse,
Braintrust, or LangSmith.

## Tooling decision record

This record consumes the current-source survey in
`docs/research/agent-debugging-tooling.md` and the `## Evidence standard`
above. No dependency should be added by this tooling-research feature. Browser
and export dependencies belong to the later implementation feature that proves a
concrete need.

| Area | Decision | Rationale | Downstream owner |
|---|---|---|---|
| Log substrate | adopt current Praxis logger/pino | Praxis already wraps pino with local JSONL output, child bindings, credential handling, renderer ingestion, and optional prompt logging. Extending correlation fields preserves the local-first default without replacing working logging infrastructure. | `epic-agent-debugging-harness-trace-correlation` |
| Praxis-native evidence bundle | adopt build-in-house | The evidence standard needs stable local manifests, full-fidelity event/log/tool/UI slices, DB relationship summaries, optional artifact pointers, explicit export policy, and a concise failure summary. That contract is Praxis-specific and must be readable from disk without a hosted service or chat history. | `epic-agent-debugging-harness-failure-replay` |
| Correlation vocabulary | adopt build-in-house | Use `runId`, `sessionId`, `turnId`, `callId`, `parentCallId`, `streamId`, renderer event id, and artifact paths as the first stable vocabulary. OpenTelemetry-style `traceId`/`spanId` may appear as optional vocabulary, not as required runtime semantics. | `epic-agent-debugging-harness-trace-correlation` |
| OpenTelemetry JS runtime | defer | The survey found OpenTelemetry useful as vendor-neutral vocabulary and future export shape, but not necessary for the v1 local bundle. Logs/browser instrumentation maturity and package-boundary risk make a runtime dependency premature. | `epic-agent-debugging-harness-trace-correlation` |
| Whole-app browser automation | adopt for downstream replay/simulation | Visual anomalies are common enough that browser replay and synthetic student simulation need browser-driven app flows and `.trace.zip`-style artifacts. The exact package is `@playwright/test` as a devDependency, likely in the root test workspace or the first test-owning workspace introduced by `epic-agent-debugging-harness-student-simulation` or `epic-agent-debugging-harness-failure-replay`. Data-flow implication: traces are local sensitive artifacts containing possible DOM, screenshot, console, and network evidence; retain only on failure or explicit capture. | `epic-agent-debugging-harness-student-simulation` |
| Component-level real-browser traces | defer | `@vitest/browser-playwright` should only be added if a downstream story proves component-level real-browser traces are better than direct Playwright tests. If chosen, it is a devDependency for `@praxis/ui` or the UI/test-owning workspace, with local trace retention and no implicit off-machine export of DOM/screenshots. | `epic-agent-debugging-harness-student-simulation` |
| Phoenix, Langfuse, Braintrust, and LangSmith | defer | Treat these as reference models and optional export/integration candidates after the local bundle schema is stable. Any adapter must be disabled by default, opt-in, and explicit about hosted or self-hosted data flow; sanitization is part of the export path, not local capture. | `epic-agent-debugging-harness-debug-runbooks` |
| Hosted observability as default evidence store | reject | A hosted default conflicts with Praxis's local-first ownership stance and would make prompt, tool, student, screenshot, DOM, and trace evidence leave the machine unless every path is carefully gated. Local bundles are the source of truth. | `epic-agent-debugging-harness-failure-replay` |
| Implicit export of sensitive evidence | reject | Prompt text, screenshots, DOM snapshots, student messages, tool inputs/results, logs, traces, and eval datasets must not be exported by default. Local capture can be full-fidelity; off-machine sharing requires an explicit raw export or a sanitized derivative. | `epic-agent-debugging-harness-debug-runbooks` |
| Hosted eval platforms replacing local fixtures/tests | reject | Phoenix, Braintrust, LangSmith, and similar systems can inform report/eval vocabulary, but Praxis regression evidence must remain local, replayable, and reviewable through fixtures, bundles, and test harness outputs. | `epic-agent-debugging-harness-debug-runbooks` |

## Downstream handoff

- `epic-agent-debugging-harness-trace-correlation`: Implement the in-house
  correlation layer over existing Praxis events/logs. Start with the stable
  identifiers from the evidence standard (`runId`, `sessionId`, `turnId`,
  `callId`, `parentCallId`, `streamId`, renderer event id, artifact path) and
  pino child bindings. Do not add OpenTelemetry JS unless a later export story
  proves the local schema is stable and needs OTLP mapping.
- `epic-agent-debugging-harness-failure-replay`: Implement the local evidence
  bundle as the source of truth. Bundle manifests should link full-fidelity local
  JSONL slices, pino log windows, tool/sub-agent/IPC records, focused DB
  relationship summaries, optional browser trace pointers, export/share policy,
  and a human-readable failure summary. No hosted store, full DB dump, or
  implicit off-machine export by default.
- `epic-agent-debugging-harness-student-simulation`: Include browser replay and
  synthetic student simulation because visual anomalies are common in the app.
  Begin with local scenario results tied to the correlation vocabulary, then add
  `@playwright/test` when implementing the browser runner and `.trace.zip`-style
  artifacts. Add `@vitest/browser-playwright` only if component-level
  real-browser traces are demonstrably better than direct Playwright tests. In
  both cases, traces remain local and retained only on failure or explicit
  capture by default.
- `epic-agent-debugging-harness-debug-runbooks`: Deliver the report/commands/
  runbook/owner-routing layer as one or more progressive-disclosure agent skills
  that point at concrete repo tools. The skill should document local bundle
  review, capture/sharing policy, failure classes, owner routing, browser trace
  inspection, and optional export posture. Phoenix, Langfuse, Braintrust,
  LangSmith, and OpenTelemetry should be described as references or opt-in
  adapters only; runbooks must reject implicit export of prompts, screenshots,
  DOM, student content, tool content, logs, traces, or eval datasets.

### Unit 3: Final decision record and downstream handoff

**File**: `.work/active/features/epic-agent-debugging-harness-tooling-research.md`
**Story**: `epic-agent-debugging-harness-tooling-research-decision-record`

```markdown
## Tooling decision record

| Area | Decision | Rationale | Downstream feature |
|---|---|---|---|
| Log substrate | <adopt/defer/reject> | <why> | trace-correlation |
| Trace IDs / spans | <adopt/defer/reject> | <why> | trace-correlation |
| Browser automation | <adopt/defer/reject> | <why> | student-simulation |
| Replay bundle format | <adopt/defer/reject> | <why> | failure-replay |
| Agent eval platform | <adopt/defer/reject> | <why> | debug-runbooks |

## Downstream handoff

- `epic-agent-debugging-harness-trace-correlation`: <specific vocabulary and constraints>
- `epic-agent-debugging-harness-failure-replay`: <bundle schema and replay inputs>
- `epic-agent-debugging-harness-student-simulation`: <browser/simulation tool choices>
- `epic-agent-debugging-harness-debug-runbooks`: <report/runbook evidence conventions>
```

**Implementation Notes**:

- This story consumes the survey and evidence standard, then updates this feature body with final choices.
- Prefer "adopt existing" over "add dependency" when the evidence value is equivalent.
- When a new dependency is justified, record the exact package, owning package/workspace, install scope, and first implementation feature expected to add it.
- Keep downstream feature files untouched unless a handoff note is necessary to avoid ambiguous implementation. If downstream files are edited, preserve their stage and dependency metadata.

**Acceptance Criteria**:

- [ ] The feature item contains `## Tooling decision record` and `## Downstream handoff`.
- [ ] Each decision states `adopt`, `defer`, or `reject`, with rationale and downstream owner.
- [ ] Any proposed new dependency includes package name, intended workspace, data-flow implications, and which later feature should add it.
- [ ] The feature can be reviewed without opening chat history: survey link, evidence standard, and handoff are all discoverable from the item body.

## Implementation Order

1. `epic-agent-debugging-harness-tooling-research-current-source-survey`
2. `epic-agent-debugging-harness-tooling-research-evidence-standard`
3. `epic-agent-debugging-harness-tooling-research-decision-record`

## Testing

### Unit 1

- Link/source validation by inspection: every external claim has an official-source URL and access date.
- Run `git diff --check` after writing the research doc to catch whitespace and markdown table issues.

### Unit 2

- Review the evidence field list against `docs/CONTRACT.md` and the motivating failures from the parent epic.
- Verify the standard uses `type` for streamed events and `kind` for stored object variants if any downstream code sketch becomes concrete.

### Unit 3

- Run `.work/bin/work-view --parent epic-agent-debugging-harness-tooling-research` and `.work/bin/work-view --ready` to verify the child story graph is visible and acyclic.
- Confirm no runtime/package files changed unless the decision record explicitly justifies them.

## Risks

- **Research can become vendor marketing rather than implementation guidance**: require official-source citations and a Praxis-fit criterion for every candidate.
- **The evidence schema can become too broad**: keep the first standard centered on the motivating failures and downstream feature needs, with optional fields explicitly marked optional.
- **Browser automation choice can blur with replay/simulation implementation**: this feature only chooses the tool direction; downstream features own actual runner setup and tests.

## Child stories

- `epic-agent-debugging-harness-tooling-research-current-source-survey` - no sibling dependencies.
- `epic-agent-debugging-harness-tooling-research-evidence-standard` - depends on `epic-agent-debugging-harness-tooling-research-current-source-survey`.
- `epic-agent-debugging-harness-tooling-research-decision-record` - depends on `epic-agent-debugging-harness-tooling-research-evidence-standard`.

## Implementation summary

Stories implemented in this run:

- `epic-agent-debugging-harness-tooling-research-current-source-survey` - `stage: review`; created `docs/research/agent-debugging-tooling.md`.
- `epic-agent-debugging-harness-tooling-research-evidence-standard` - `stage: review`; added the local evidence bundle standard and vocabulary sketch.
- `epic-agent-debugging-harness-tooling-research-decision-record` - `stage: review`; added final tooling decisions and downstream handoff.

Cross-cutting deviations: none. This feature intentionally remained docs/substrate-only and did not add runtime dependencies or change package manifests.

Verification: each story ran `git diff --check`; orchestrator verified all child stories are at `stage: review` with `.work/bin/work-view --parent epic-agent-debugging-harness-tooling-research`. Full `pnpm` checks were not run because no source, package, test, or config files were changed by the feature implementation.

## Review (2026-05-31)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Quick substrate review requested by user. Checked child story review records, the research doc, evidence standard, and downstream handoff. Captured the user clarification that browser replay/simulation is required because visual anomalies are common. The feature is docs/substrate-only, has no runtime/package changes, and is ready to unblock trace correlation.
