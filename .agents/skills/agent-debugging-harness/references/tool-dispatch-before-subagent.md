# Tool Dispatch Threw Before Sub-Agent Start

Use when logs show `tool.dispatch.error` and the expected sub-agent never
starts, such as `course.start_drafting` failing before the drafter launches.

## First Checks

- Find the first `tool.dispatch.error` record and its `callId`.
- Confirm whether the tool label is marked `spawnsSubAgent`.
- Check whether failure happened in the tool handler before sub-agent registry
  wiring or inside a backing service.

## Evidence To Gather

- Pino log slice around `tool.dispatch.start` and `tool.dispatch.error`.
- `callId`, `runId`, `sessionId`, and parent turn id.
- Service stack trace and failing DB constraint or handler error.
- Debug bundle manifest when available.

## Commands

```bash
pnpm debug:bundle --out .praxis/debug/bundles --failure-class tool-dispatch --title "tool dispatch before sub-agent" --session <sessionId> --call <callId>
pnpm vitest run packages/tools/src/__tests__/registry.test.ts
pnpm vitest run packages/core/src/services/__tests__/session-service.debug-trace.test.ts
```

## Likely Owners

- `packages/tools/src/registry.ts`
- The specific tool handler under `packages/tools/src/`
- Backing service under `packages/core/src/services/`
- For course drafting: `packages/tools/src/course/start-drafting.ts` and
  document-scope/course-create services.

## Next Debug Step

Open the handler at the stack frame immediately above `InProcessToolRegistry`.
If the failure is per-item or recoverable, prefer a discriminated result over a
throw; if it is a true invariant violation, keep fail-fast behavior and make the
report point at the exact service/schema owner.
