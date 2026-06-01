# Agent Debugging Tooling Research

## Context

`epic-agent-debugging-harness` needs an evidence standard for debugging agent
behavior across engine events, tool dispatch, sub-agents, IPC streams, renderer
output, persistence, browser state, and replay/simulation artifacts. The tooling
decision has to fit Praxis rather than reshape Praxis around a vendor trace
model.

The hard constraint is local-first privacy. `docs/SPEC.md` says local
deployments keep all data on-device and telemetry is off by default. A
debugging harness must therefore work without exporting prompts, screenshots,
student data, traces, logs, or eval datasets to a third-party service. Hosted or
self-hosted observability tools can be useful references and optional export
targets, but they cannot be the default evidence store.

Praxis is also a TypeScript/Electron pnpm workspace. `docs/ARCHITECTURE.md`
keeps the UI behind `@praxis/client`, core as the orchestrator, tools in
`@praxis/tools`, and engine adapters in `@praxis/engines`. Any harness contract
should follow those boundaries: capture facts at existing boundaries and avoid a
runtime dependency that makes core or UI depend on a specific LLM observability
platform.

## Questions

1. What evidence should Praxis build itself so another agent can debug a failure
   without reading chat history?
2. Which existing dependencies already cover enough logging or test evidence?
3. Which browser/replay tooling is worth adding later, and in which downstream
   feature?
4. Which agent-observability and evaluation systems should influence the
   vocabulary, and which should remain optional export paths?
5. What should be rejected because it conflicts with local-first defaults or the
   package boundaries?

## Criteria

| Criterion | Why it matters for Praxis |
|---|---|
| Local-first by default | Must not send student data, prompts, screenshots, logs, traces, or eval datasets off-device unless the user explicitly opts in. |
| TypeScript/Electron fit | Must work with Node 24+, ESM, Electron main/renderer split, pnpm workspaces, and current Vitest setup. |
| Evidence coverage | Must help inspect engine events, tool calls/results, sub-agent steps, IPC streams, renderer output, logs, DB state, and browser traces. |
| Replay support | Must produce artifacts another agent can consume without chat-history archaeology. |
| Redaction and retention | Must preserve prompt redaction defaults and support bounded local artifacts. |
| Package-boundary fit | Must not make `@praxis/core`, `@praxis/ui`, or `@praxis/engines` inherit vendor-shaped runtime contracts unnecessarily. |
| Incremental adoption | Must let downstream features add only the dependency needed for the concrete implementation slice. |

## Current Praxis baseline

- `packages/core/src/config/logging-config.ts` defines logging as local config.
  Packaged builds default to `level: "info"` and `fileEnabled: false`; dev
  builds default to debug file logging. `PRAXIS_LOG_FILE` and
  `PRAXIS_LOG_PROMPTS` are explicit overrides.
- Prompt-like fields are redacted by default. `prompt`, `messages`,
  `modelOutput`, and `systemPrompt` become `"[REDACTED]"` unless prompt logging
  is explicitly enabled.
- `packages/desktop/electron/main/logger.ts` wraps pino, applies API-key and
  credential redaction paths, supports child bindings, ingests renderer records,
  and writes local rotated JSONL only when configured.
- `packages/tools/src/registry.ts` already emits `tool.dispatch.start`,
  `tool.dispatch.ok`, and `tool.dispatch.error`; adapters can pass an engine-side
  `callId` through `DispatchMeta` into `ToolContext.callId`.
- Root `package.json` has Vitest 3.2.4 and no Playwright or
  `@vitest/browser-playwright` dependency. `packages/ui/vitest.config.ts` uses
  jsdom with React/Vite, not Browser Mode.

This is enough for a first trace-correlation substrate if the downstream
features standardize run IDs, turn IDs, session IDs, call IDs, stream IDs, and
artifact manifests around the existing event/log boundaries.

## Options evaluated

| Candidate | Category | Official source | Fit | Decision | Notes |
|---|---|---|---|---|---|
| Current Praxis logger + pino | Local structured logging | [Pino site](https://getpino.io/), [pino redaction docs](https://github.com/pinojs/pino/blob/main/docs/redaction.md), [pino child logger docs](https://github.com/pinojs/pino/blob/main/docs/child-loggers.md), [pino transport docs](https://github.com/pinojs/pino/blob/main/docs/transports.md). Accessed 2026-06-01. | Strong. Already installed and wrapped by Praxis; supports JSON records, redaction, child bindings, and local file transports. | **Adopt** as the log substrate. | Build correlation fields and evidence-bundle pointers around it. Do not replace it with a hosted log backend. Keep prompt logging opt-in. |
| OpenTelemetry JS | Trace vocabulary and export bridge | [OpenTelemetry JavaScript docs](https://opentelemetry.io/docs/languages/js/). Accessed 2026-06-01. | Medium. Traces and metrics are stable; logs are still development, and browser client instrumentation is experimental/mostly unspecified. | **Defer as runtime dependency; adopt vocabulary selectively.** | Use trace/span language where it clarifies causality. Add OTLP export later only as an opt-in adapter over a Praxis-native evidence bundle. |
| Playwright | Browser automation and replay-oriented test traces | [Playwright Trace Viewer docs](https://playwright.dev/docs/trace-viewer-intro). Accessed 2026-06-01. | Strong for browser-driven student simulation and UI failure replay. Trace Viewer exposes action timeline, logs, source, network, errors, console, and interactive DOM snapshots. | **Adopt for downstream browser replay/simulation.** | Needed because visual anomalies are common in Praxis agent failures. Add it in the first downstream feature that implements browser replay or student simulation, not in this research feature. Trace files can include DOM/screenshot-like state, so they must stay local by default. |
| Vitest Browser Mode + Playwright provider | Component/browser tests inside Vitest | [Vitest Browser Mode docs](https://vitest.dev/guide/browser/), [Vitest Trace View docs](https://vitest.dev/guide/browser/trace-view). Accessed 2026-06-01. | Medium to strong. Keeps tests in Vitest idioms and can use a Playwright provider; current repo is Vitest 3.2.4/jsdom, while current docs describe newer Browser Mode capabilities. | **Defer; add if component-level browser traces beat full Playwright tests.** | Useful for renderer/component fidelity. Vitest trace files are Playwright-provider-only, so adopting Browser Mode still implies adding browser-provider deps and local trace-retention policy. |
| Phoenix | AI observability, tracing, datasets, evaluations, experiments | [Phoenix docs](https://arize.com/docs/phoenix). Accessed 2026-06-01. | Good conceptual fit for agent traces/evals, but service-oriented. Phoenix is built on OpenTelemetry/OpenInference and supports tracing, evals, prompt work, datasets, and experiments. | **Optional export/reference only.** | Valuable vocabulary for traces, span replay, datasets, and eval workflows. Not the primary store because the default setup sends traces to a Phoenix service/cloud/local server outside the app evidence bundle. |
| Langfuse | LLM observability/tracing/prompt/eval platform | [Langfuse SDK overview](https://langfuse.com/docs/observability/sdk/overview), [Langfuse observability overview](https://langfuse.com/docs/observability/overview), [Langfuse self-host Docker Compose docs](https://langfuse.com/self-hosting/deployment/docker-compose). Accessed 2026-06-01. | Good for hosted/self-hosted LLM tracing and OpenTelemetry-based integration; too heavy as a default local harness dependency. | **Optional export/reference only.** | Langfuse's trace/session/observation model is useful, and self-hosting exists, but Praxis should not export prompts/tool data by default or require a side service to debug local runs. |
| Braintrust | AI traces, logs, datasets, experiments, evals | [Braintrust trace viewer docs](https://www.braintrust.dev/docs/observe/examine-traces), [Braintrust evaluation docs](https://www.braintrust.dev/docs/evaluate/run-evaluations), [Braintrust self-hosting docs](https://www.braintrust.dev/docs/admin/self-hosting). Accessed 2026-06-01. | Strong hosted eval workflow; heavy operational posture for local-first Praxis. | **Optional export/reference only; reject as default.** | Useful model for immutable experiments and trace inspection. Self-hosting still separates a data plane and managed control plane and has its own telemetry posture, so it is not a default local evidence store. |
| LangSmith | LLM observability and evaluation platform | [LangSmith observability docs](https://docs.langchain.com/langsmith/observability), [LangSmith evaluation docs](https://docs.langchain.com/langsmith/evaluation), [LangSmith platform setup docs](https://docs.langchain.com/langsmith/platform-setup). Accessed 2026-06-01. | Strong LangChain ecosystem fit, less natural for Praxis's custom harness and local-first default. | **Optional export/reference only.** | Good reference for datasets, offline/online evals, and trace investigation. Cloud/self-hosted choices exist, but default Praxis evidence must remain local and vendor-neutral. |
| Sentry / Datadog-style observability | General error/performance observability | [Pino transport list](https://github.com/pinojs/pino/blob/main/docs/transports.md). Accessed 2026-06-01. | Low for the agent-debugging evidence standard. | **Reject for this feature.** | These are useful production operations tools, not the source of truth for prompt/tool/replay evidence. Any future export must be explicit opt-in and redacted. |

## Recommendation summary

### Build in-house

- A Praxis-native evidence bundle that is the source of truth for debugging
  harness runs.
- Correlation fields over existing boundaries: `runId`, `sessionId`, `turnId`,
  engine event IDs where available, tool `callId`, sub-agent parent call IDs,
  IPC `streamId`, renderer event IDs, and artifact paths.
- A local replay manifest that points to JSONL logs, selected redacted event
  slices, DB snapshots or query summaries, browser traces when present, and a
  short failure summary.
- Redaction and retention policy in the bundle schema. Prompt/message/model
  content should be redacted by default, with opt-in capture only for explicit
  debugging sessions.

### Use existing dependency

- Keep pino as the structured log substrate. Extend fields and bindings; do not
  replace it.
- Keep current Vitest/jsdom tests for unit and component behavior that does not
  need a real browser.
- Use existing `ToolContext.callId`, registry dispatch logs, session IDs, and
  IPC stream IDs before adding a span library.

### Add dependency if justified

- Add Playwright when the student-simulation or failure-replay features create
  browser replay or whole-app simulation. Visual anomalies are common enough
  that browser traces are part of the required downstream direction, but the
  dependency should still be added by the first feature that uses it.
- Consider `@vitest/browser-playwright` only if downstream work benefits from
  staying inside Vitest for component-level real-browser traces. Do not add it
  solely because Browser Mode exists.

### Optional export/reference only

- OpenTelemetry JS: use as vocabulary now; add OTLP export only after the local
  evidence bundle is stable.
- Phoenix, Langfuse, Braintrust, and LangSmith: use as design references for
  trace/eval/dataset concepts; add export adapters only after an explicit opt-in
  product decision.

### Reject

- A hosted observability platform as the default trace store.
- Default export of prompts, screenshots, DOM snapshots, student messages,
  tool inputs/results, logs, traces, or eval datasets off-device.
- A new agent framework or durable execution platform as the debugging harness
  foundation.
- General observability tooling as a substitute for replayable agent evidence.

## Decisions for downstream features

| Downstream area | Decision | Handoff |
|---|---|---|
| Trace correlation | Build in-house over current events/logs. | Define a small evidence schema and correlation helpers before introducing OpenTelemetry SDKs. |
| Failure replay | Build in-house local bundles. | Bundle manifests should point to redacted JSONL, event slices, DB state summaries, and optional browser traces. |
| Student simulation | Add Playwright for browser replay/simulation. | Visual anomalies are common enough that simulation should include browser-driven flows and local trace artifacts; retain traces only on failure or explicit capture by default. |
| UI/component browser fidelity | Defer Vitest Browser Mode. | Revisit when a component-level real-browser gap appears; compare against direct Playwright tests at that time. |
| Agent evaluation | Build local fixtures and result summaries first. | Use Phoenix/Braintrust/LangSmith concepts for dataset/eval vocabulary, but no platform export by default. |
| Vendor exports | Optional only. | Exports must be explicit, redacted, documented, and disabled by default. |

## Common pitfalls / non-goals

- Do not confuse a trace UI with a durable evidence standard. Praxis needs an
  artifact another agent can inspect from disk.
- Do not treat OpenTelemetry logs as ready to replace pino; OpenTelemetry JS
  still marks logs as development.
- Do not rely on browser instrumentation as the first trace substrate; current
  OpenTelemetry JS docs still mark browser client instrumentation experimental.
- Do not add Playwright or Browser Mode in the research feature. Add browser
  dependencies in the first downstream feature that actually creates browser
  traces.
- Do not store prompt/message/model content unless an explicit debugging mode
  enables it. Metadata and redacted summaries are the default.
- Do not export Playwright traces casually. DOM snapshots and screenshots can
  contain student data and must be treated as sensitive local artifacts.
- Do not use vendor-hosted eval platforms as the primary regression suite.
  Praxis needs local fixtures and local replay before optional hosted analysis.
