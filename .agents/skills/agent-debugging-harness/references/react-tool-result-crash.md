# React Crashed Rendering Tool Result

Use when the UI crashes with errors like "Objects are not valid as a React
child" while rendering a tool result, draft summary, quick-check card, or tool
disclosure.

## First Checks

- Identify the component at the top of the React stack.
- Confirm whether a raw object was passed as a child instead of formatted text,
  JSON, or a typed card model.
- Check if the object came from `tool_result.result.value`, a draft/course
  object, or renderer event normalization.

## Evidence To Gather

- Browser console error and React stack.
- Tool `callId`, `toolName`, and result shape.
- DOM excerpt or screenshot if the page partially rendered.
- Debug bundle or simulation report paths.

## Commands

```bash
PRAXIS_RUN_BROWSER_SIMULATION=1 pnpm exec playwright test tests/student-simulation-browser.spec.ts
pnpm exec playwright show-trace <trace.zip>
pnpm vitest run packages/ui/src/__tests__/authoring-chat-pane-quick-check.test.tsx
pnpm debug:bundle --out .praxis/debug/bundles --failure-class ui-render --title "React tool result crash" --session <sessionId> --call <callId>
```

## Likely Owners

- `packages/ui/src/hooks/use-streamed-send.ts`
- `packages/ui/src/components/tool-call-disclosure.tsx`
- `packages/ui/src/components/tool-entry.tsx`
- Mode-specific tab body if the crash only happens in one workflow.

## Next Debug Step

Add or adjust a renderer test that feeds the failing value shape into the
component. The fix should format or route the value explicitly; do not rely on
implicit `String(object)` behavior.
