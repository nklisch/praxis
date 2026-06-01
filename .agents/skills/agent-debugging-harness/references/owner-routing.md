# Owner Routing

Use this map after identifying the first bad observation. Confirm by reading
the code and running the targeted command; routing is a starting point, not a
verdict.

| Symptom | Likely owner area | First files to inspect | Targeted check |
|---|---|---|---|
| Raw `<invoke>` or tool XML in chat | Renderer message/tool rendering | `packages/ui/src/hooks/use-streamed-send.ts`, `packages/ui/src/components/message.tsx`, course-create tab body | `pnpm student-sim:run course-create-structured-question --out .praxis/debug/simulations/tool-leak` |
| `[object Object]` visible in chat | Stream normalization or React child rendering | `packages/ui/src/hooks/use-streamed-send.ts`, `packages/ui/src/components/tool-call-disclosure.tsx` | `PRAXIS_RUN_BROWSER_SIMULATION=1 pnpm exec playwright test tests/student-simulation-browser.spec.ts` |
| `tool.dispatch.error` | Tool registry or service handler | `packages/tools/src/registry.ts`, specific handler under `packages/tools/src/`, backing service under `packages/core/src/services/` | `pnpm vitest run packages/tools/src/__tests__/registry.test.ts` |
| Sub-agent never appears | Sub-agent registry or parent call id wiring | `packages/core/src/services/sub-agent-registry.ts`, `packages/tools/src/course/start-drafting.ts`, desktop sub-agent channel | `pnpm vitest run packages/desktop/electron/main/__tests__/subagent-channel.test.ts` |
| IPC stream starts but events stop | Desktop/client stream helpers | `packages/desktop/electron/main/stream-handler.ts`, `packages/client/src/`, session channel tests | `pnpm vitest run packages/desktop/electron/main/__tests__/session-channel-trace.test.ts` |
| React crash while rendering tool result | UI component receiving non-renderable value | `packages/ui/src/components/tool-call-disclosure.tsx`, `packages/ui/src/components/tool-entry.tsx`, `packages/ui/src/hooks/use-streamed-send.ts` | `pnpm vitest run packages/ui/src/__tests__/authoring-chat-pane-quick-check.test.tsx` |
| SQLite FK/document-scope failure | Core service/schema ownership | `packages/core/src/services/document-scopes-service.ts`, package schema files, migrations | `pnpm vitest run tests/db/sessions-fk-cascade.test.ts` plus `pnpm db:show` |
| Student simulation mismatch | Scenario, runner, or UI-visible behavior | `tests/helpers/student-simulation/`, `tests/student-simulation-browser.spec.ts`, `tests/student-simulation/` | `pnpm vitest run tests/student-simulation-client.test.ts tests/student-simulation-scenarios.test.ts` |

## Package Boundaries

- `@praxis/tools`: tool schemas, registry dispatch, tool handler behavior.
- `@praxis/core`: session orchestration, services, DB, debug bundle capture,
  document scopes, sub-agent registry.
- `@praxis/desktop`: Electron IPC channels, stream plumbing, renderer log
  ingestion.
- `@praxis/client`: typed RPC transport and stream client behavior.
- `@praxis/ui`: chat rendering, tool disclosure, quick-check/structured question
  cards, browser-visible anomalies.
- `tests/helpers/student-simulation`: deterministic scenario runner and browser
  replay harness.
