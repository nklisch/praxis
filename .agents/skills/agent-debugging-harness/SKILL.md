---
name: agent-debugging-harness
description: >
  Use when debugging Praxis agent-harness failures: tool calls leaked into chat,
  raw <invoke> markup, [object Object] rendering, tool.dispatch.error, sub-agent
  stalls, IPC stream failures, React renderer crashes, persistence/FK failures,
  course-create drafting failures, or student-simulation/browser mismatches.
  Guides agents through local evidence capture, replay/simulation commands,
  owner routing, and substrate item filing.
---

# Agent Debugging Harness

Use this skill to turn an agent-harness failure into a compact, evidence-backed
debugging report and next action. The evidence is local-first and full-fidelity;
do not add redaction steps unless the user explicitly asks to export or share
the bundle off-machine.

## Triage Flow

1. Classify the failure class from the first bad observation:
   `tool-call-leak`, `tool-dispatch`, `subagent`, `ipc-stream`, `ui-render`,
   `persistence`, or `student-simulation`.
2. Gather correlation ids: `runId`, `sessionId`, `turnId`, tool `callId`,
   IPC `streamId`, renderer event ids, and artifact paths.
3. Capture or inspect the smallest local evidence bundle that explains the
   failure.
4. Load only the reference that matches the symptom:
   - Report template: `references/report-shape.md`
   - Commands: `references/commands.md`
   - Owner routing: `references/owner-routing.md`
   - Raw tool markup or object rendering: `references/tool-call-leaked-into-chat.md`
   - Tool dispatch before sub-agent launch: `references/tool-dispatch-before-subagent.md`
   - React crash rendering a tool result: `references/react-tool-result-crash.md`
   - IPC stream died or missed events: `references/ipc-stream-died.md`
   - Sub-agent missing or stalled: `references/subagent-missing-or-stalled.md`
   - Persistence/FK/document-scope failure: `references/persistence-fk-failure.md`
   - Browser/student simulation mismatch: `references/student-simulation-visual-mismatch.md`
5. Run the targeted command from `references/commands.md`.
6. File or update a substrate item with the report shape. Product bugs become
   `.work` items; broken fixtures or stale tests are repaired in place.

## Output Standard

Before changing code, produce or update a compact failure summary with:

- failure class and first bad observation
- run/session/turn/call/stream/renderer ids
- relevant trace/log/browser artifact paths
- likely owner package/service/component
- next debug step and targeted verification command

Use `references/report-shape.md` for the exact template.
