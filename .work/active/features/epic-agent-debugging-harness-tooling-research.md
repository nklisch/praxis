---
id: epic-agent-debugging-harness-tooling-research
kind: feature
stage: implementing
tags: []
parent: epic-agent-debugging-harness
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-31
updated: 2026-05-31
---

# Tooling Research

## Brief

Select the debugging harness's evidence standard and supporting tool stack through current-source research, without locking the epic into a guessed vendor or framework. This feature should compare trace/logging, browser automation, replay, and agent-evaluation options against Praxis's local-first privacy stance, TypeScript monorepo shape, Electron deployment, and existing pino/Vitest/testing-library foundations.

The deliverable is a durable decision record inside this item and any needed `docs/research/` notes, not a production implementation. It should decide what gets built in-house, what existing dependency is enough, and where a new dependency is justified. Downstream features depend on this because they need a stable vocabulary for trace events, failure bundles, replay inputs, and simulation outcomes.

This feature does not implement the trace pipeline, replay runner, or student simulator. It only defines the criteria, researches the options, and records the chosen direction so the implementation features can stay concrete.

## Epic context

- Parent epic: `epic-agent-debugging-harness`
- Position in epic: foundation feature - every implementation feature consumes its tool and evidence decisions.

## Foundation references

- `docs/SPEC.md` - privacy stance, local-first telemetry default, testing stack, and rejected "agent framework as foundation" constraint.
- `docs/ARCHITECTURE.md` - agent harness, engine adapters, transport, and package boundaries.
- `docs/CONTRACT.md` - engine events, tool registry, sub-agent, and IPC contracts.

## UI alignment

No mockups for this feature. The parent epic keeps v1 output as research notes, item-body decision records, command/report conventions, and internal harness contracts rather than a net-new app screen. If downstream work adds a visual trace viewer inside Praxis, that later feature should run the mockup workflow.

## Design decisions

- **Question checkpoint**: No unresolved user-facing direction question remains for this feature. The parent epic already pins the audience, local-first stance, replay-plus-simulation shape, and evidence categories; this feature designs the research work needed to turn those into concrete decisions.
- **Official-source standard**: External tooling claims must cite current official docs or first-party repositories. This is required because browser automation, LLM observability, and agent-evaluation tooling change quickly.
- **Dependency posture**: Do not mutate `package.json` in this feature unless the final decision record explicitly proves a small research-only validation dependency is necessary. Implementation features should add production dependencies after this feature chooses the direction.
- **Telemetry posture**: Treat hosted observability/evaluation platforms as candidates or optional export targets, not as the primary source of truth. Praxis's first evidence format must work locally, with prompt/content redaction by default.

## Architectural choice

### Option A: Vendor-first LLM observability platform

Adopt a platform such as Phoenix, Langfuse, or Braintrust as the primary trace and evaluation store, then shape Praxis harness output around that platform's trace/eval model. This optimizes for rich existing UIs and agent-eval workflows, but it fights the local-first telemetry default and would force downstream code to inherit a vendor-shaped contract before Praxis has its own evidence standard.

### Option B: OpenTelemetry-first instrumentation

Use OpenTelemetry spans as the first-class trace representation across session, tool, sub-agent, IPC, and renderer layers. This optimizes for vendor-neutral propagation and future export, but current OpenTelemetry JavaScript docs mark browser instrumentation as experimental and logs as still in development. It is a useful vocabulary and bridge, not the lowest-risk source of truth for this Electron-local harness.

### Option C: Praxis-native evidence standard with optional adapters

Define a small Praxis evidence bundle first, grounded in existing `EngineEvent`, pino log records, tool dispatch `callId`s, `SubAgentRegistry` events, IPC stream events, Vitest/FakeEngine fixtures, and browser traces where adopted. External tools become optional capture or export adapters. This optimizes for local reproducibility, privacy, and compatibility with current package boundaries while leaving room for Playwright/Vitest Browser Mode and OpenTelemetry-compatible exports.

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
| Redaction and retention | Must preserve current prompt redaction defaults and support bounded local artifacts. |

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
- Include license/deployment/privacy notes when a tool stores data outside the local machine or requires a running service.
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
  redaction: "always_redacted" | "redacted_by_default" | "safe_metadata";
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
    redaction: DebugEvidenceFieldSketch["redaction"];
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
- The standard should state whether prompt/message content is stored, redacted, summarized, or pointed to. Default to redaction unless the user explicitly enables prompt logging.
- The standard must be usable by an agent reading a bundle without running the app: include a concise failure summary and pointers to evidence artifacts.

**Acceptance Criteria**:

- [ ] The feature item contains a `## Evidence standard` section with required/optional/out-of-scope evidence fields.
- [ ] The standard maps each evidence field to a downstream consumer and a redaction/retention policy.
- [ ] The standard explicitly covers the motivating failures: raw tool-call markup in chat, `course.start_drafting` FK failure before sub-agent launch, and React crash on structured tool summary object rendering.
- [ ] The standard identifies which fields are stable enough for downstream implementation and which remain research notes.

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
- [ ] Any proposed new dependency includes package name, intended workspace, privacy implications, and which later feature should add it.
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
