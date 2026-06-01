# Sub-Agent Missing Or Stalled

Use when a parent tool call should spawn a sub-agent but no child progress
appears, or progress starts and then stops without a terminal result.

## First Checks

- Confirm the tool label has `spawnsSubAgent: true`.
- Capture the parent tool `callId` and expected child subscription key.
- Check whether the parent `tool_result` arrived before, after, or without
  sub-agent progress events.

## Evidence To Gather

- Parent `tool_call` / `tool_result` records.
- Sub-agent registry events keyed by parent `callId`.
- Renderer sub-agent block state.
- Any `tool.dispatch.error` stack that occurred before launch.

## Commands

```bash
pnpm debug:bundle --out .praxis/debug/bundles --failure-class subagent --title "sub-agent missing" --session <sessionId> --call <callId>
pnpm vitest run packages/desktop/electron/main/__tests__/subagent-channel.test.ts
pnpm vitest run packages/tools/src/__tests__/registry.test.ts
```

## Likely Owners

- `SubAgentRegistry` implementation under `packages/core/src/services/`
- `packages/tools/src/course/start-drafting.ts`
- `ToolContext.callId` wiring in tool registry/bridge code
- `packages/ui` sub-agent rendering if backend events are present but hidden

## Next Debug Step

Trace the parent `callId` from tool dispatch into sub-agent registration and
then into the renderer subscription. If the id changes or disappears, fix the
wiring before investigating model behavior.
