# Tool Call Leaked Into Chat

Use when chat visibly contains raw `<invoke ...>`, XML-ish tool calls,
`course.list_library_documents`, or `[object Object]` instead of a student-safe
message or tool disclosure.

## First Checks

- Confirm whether the leak is in final visible chat, not only a debug trace.
- Search the captured DOM/screenshot for `<invoke` and `[object Object]`.
- Check whether the event was a `model_message`, `tool_call`, `tool_result`, or
  renderer normalization issue.

## Evidence To Gather

- `runId`, `sessionId`, and tool `callId`.
- Browser `trace.zip`, `screenshot.png`, `dom.html`, and `console.md` when the
  leak is visual.
- `simulation-result.json` or `simulation-events.jsonl` for student simulation.

## Commands

```bash
pnpm student-sim:run course-create-structured-question --out .praxis/debug/simulations/tool-leak
PRAXIS_RUN_BROWSER_SIMULATION=1 pnpm exec playwright test tests/student-simulation-browser.spec.ts
pnpm debug:bundle --out .praxis/debug/bundles --failure-class ui-render --title "tool call leaked into chat" --session <sessionId> --call <callId>
```

## Likely Owners

- `packages/ui/src/hooks/use-streamed-send.ts`
- `packages/ui/src/components/message.tsx`
- `packages/ui/src/components/tool-call-disclosure.tsx`
- Course-create tab body when the leak is isolated to course creation.

## Next Debug Step

Read the stream item that rendered the bad text. If the raw invocation arrived
as `model_message`, inspect the engine/prompt path. If it arrived as
`tool_call` or `tool_result`, inspect UI normalization and disclosure rendering.
