---
id: epic-tutor-session-feel-cancellation-propagation-core-plumbing
kind: story
stage: implementing
tags: [core, tools]
parent: epic-tutor-session-feel-cancellation-propagation
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Story 1: Core signal plumbing

## Scope

Add `signal?: AbortSignal` to `DispatchMeta` and `ToolContext`; thread
it through `InProcessToolRegistry.dispatch` into the per-call
`callContext`. No behavior change yet — engine adapters in the next
story start supplying signals.

## Units

- Unit 1 (signal field on `DispatchMeta` at
  `packages/tools/src/registry.ts:14-20` and on `ToolContext` at
  `packages/core/src/types/tool.ts:96-140`).
- Unit 2 (`dispatch()` threads `meta.signal` into the shallow-copied
  `callContext`).
- Unit 8 partial — test that `dispatch(name, args, { signal })`
  produces `ctx.signal === signal` in the handler.

## Acceptance Criteria

- [ ] Both `DispatchMeta.signal?` and `ToolContext.signal?` typed and
      optional.
- [ ] `dispatch(name, args, { signal })` results in the handler
      receiving `ctx.signal === signal`.
- [ ] `dispatch(name, args)` (no meta) still works; handler sees
      `ctx.signal === undefined`.
- [ ] `pnpm typecheck` passes.
- [ ] Existing registry tests pass without modification.

## Out of scope

- Engine adapters threading signal into dispatch (story 2).
- Sub-agent abort flow (story 2).
- Tool handler eager-bail logic (best-effort, opportunistic).
