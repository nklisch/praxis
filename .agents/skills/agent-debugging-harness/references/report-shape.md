# Report Shape

Use this compact shape in chat, substrate items, or `simulation-report.md`
handoffs. Keep it short enough that another agent can act without reading the
whole transcript.

```md
## Failure Summary

- Failure class: <tool-call-leak | tool-dispatch | subagent | ipc-stream | ui-render | persistence | student-simulation>
- First bad observation: <the earliest concrete thing that went wrong>
- Run id: <runId or none>
- Session ids: <sessionId list or none>
- Turn id: <turnId or none>
- Tool call ids: <callId list or none>
- IPC stream ids: <streamId list or none>
- Renderer event ids: <rendererEventId list or none>
- Artifacts: <trace zip, screenshot, DOM, console, JSON/JSONL, bundle paths>
- Relevant trace/log slice: <file path and narrow time/id range>
- Likely owner: <package/service/component>
- Next debug step: <one command or code area to inspect next>
- Verification command: <targeted test/replay/simulation command>
```

## Failure Classes

- `tool-call-leak`: raw tool markup, XML-ish invocation text, or object string
  leaks into student chat.
- `tool-dispatch`: tool registry or service handler throws, especially before a
  sub-agent starts.
- `subagent`: expected child agent missing, no progress events, or parent call
  id not wired.
- `ipc-stream`: renderer/client stream start, event, cancel, or completion is
  missing or out of order.
- `ui-render`: React crashes or renders an object/tool result incorrectly.
- `persistence`: SQLite/Drizzle/schema/FK/document-scope failure.
- `student-simulation`: client/browser simulation mismatch or visual anomaly.

## Substrate Handoff

When the failure is a product bug, create or update a `.work` item with the
summary, evidence paths, owner route, and verification command. Do not rely on
chat history as the durable record.
