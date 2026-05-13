---
id: epic-tutor-session-feel-cancellation-propagation-core-plumbing
kind: story
stage: review
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

## Implementation Notes

### What landed

**Unit 1 — Type changes:**
- `packages/tools/src/registry.ts`: Added `signal?: AbortSignal` to `DispatchMeta` with full JSDoc explaining the abort semantics and the optional contract. Updated the interface JSDoc to reflect the dual purpose (callId + signal).
- `packages/core/src/types/tool.ts`: Added `signal?: AbortSignal` to `ToolContext` (after `callId?`, before `services`) with JSDoc explaining how it's populated, what handlers should do with it, and why it's optional.

**Unit 2 — Dispatch threading:**
- `packages/tools/src/registry.ts` `dispatch()`: Replaced the single-field ternary (`callId !== undefined ? { ...ctx, callId } : ctx`) with a two-field conditional spread that handles all four combinations (neither / callId-only / signal-only / both) without allocating on the common path.

**Unit 8 (partial) — Tests:**
- `packages/tools/src/__tests__/registry.test.ts`: Added 3 new tests after the existing `meta.callId` tests:
  1. `dispatch(name, args, { signal })` → `ctx.signal === signal` (reference identity)
  2. `dispatch(name, args)` (no meta) → `ctx.signal === undefined`
  3. `dispatch(name, args, { callId })` (no signal) → `ctx.signal === undefined` AND `ctx.callId === callId`

### Acceptance criteria check

- [x] Both `DispatchMeta.signal?` and `ToolContext.signal?` typed and optional.
- [x] `dispatch(name, args, { signal })` results in the handler receiving `ctx.signal === signal`.
- [x] `dispatch(name, args)` (no meta) still works; handler sees `ctx.signal === undefined`.
- [x] `pnpm typecheck` passes (errors present are pre-existing: missing `retrieve-from-documents.ts` from a parallel in-flight feature; core and tools packages have zero new type errors from this story).
- [x] Existing 8 registry tests pass without modification; 3 new tests added.

### Deviations

None. The conditional spread pattern matches the design exactly. The `noUselessUndefinedInitialization` lint infos (3) in the new tests were fixed inline (`let capturedSignal: AbortSignal | undefined` without `= undefined`). Two pre-existing biome warnings on `lock` and `authoring` stubs in the existing test file were not touched (out of scope).
