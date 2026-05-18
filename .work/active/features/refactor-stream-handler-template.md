---
id: refactor-stream-handler-template
kind: feature
stage: drafting
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Refactor: extract reusable stream-handler template for IPC channels

## Brief

Every streaming IPC channel duplicates the same ~60 lines of scaffolding:

1. `new AbortController()` + register in `activeAbortControllers` map
2. Child log + `eventsChannel` name composition + push callback
   (WebContents-alive check + `send`)
3. `streamLog.info("start")`
4. Try-block: subscribe / async-for / iterate / push `{kind:"done"}`
5. Catch-block: push `{kind:"error", message}`
6. Finally-block: cleanup, `activeAbortControllers.delete`
7. Companion `*.cancel` handler that calls `controller.abort()`

This pattern repeats in at least 8 places:

- `packages/desktop/electron/main/ipc-server.ts:195-242` (session.send)
- `packages/desktop/electron/main/ipc-server.ts:615-667` (memory.episodic)
- `packages/desktop/electron/main/ipc-server.ts:1545-1695` (gates.compute)
- `packages/desktop/electron/main/activity-channel.ts:34-77`
- `packages/desktop/electron/main/quick-check-channel.ts:26-68`
- `packages/desktop/electron/main/course-create-drafts-channel.ts:28-96`
- `packages/desktop/electron/main/ingest-channel.ts:135-175`
- `packages/desktop/electron/main/subagent-channel.ts` (similar shape)

Total duplicated surface: ~400 lines. Extracting a single helper or class
collapses that to ~50 lines of usage.

This is **pure refactor** — the wire-format `{kind:"event"|"done"|"error"}`
envelope, the channel naming scheme, and the AbortController cancel
semantics must be preserved exactly. This refactor should land **before**
`refactor-ipc-server-extract-domain-channels` so the channels extracted
from ipc-server.ts can adopt the template on extraction.

## Surface area

Proposed helper (verify shape during design):

```ts
// packages/desktop/electron/main/_utils/stream-handler.ts
export function registerStreamHandler<T>(opts: {
  channelBase: string;                   // e.g. "praxis.session.send"
  log: Logger;
  webContentsGetter: () => WebContents | null;
  activeAbortControllers: Map<string, AbortController>;
  iterate: (
    streamId: string,
    signal: AbortSignal,
  ) => AsyncIterable<T>;
}): { start: (event, streamId) => Promise<void>; cancel: (event, streamId) => void };
```

Or a class-based variant if state is heavier. Design pass decides.

## Why a feature (not a story)

- Touches 8 call sites — multi-file
- Helper shape is a design call (function + closure vs class + method,
  generic shape, where to live)
- Ordering matters: must land before
  `refactor-ipc-server-extract-domain-channels` so newly-extracted
  channels can use it from the start

## Discovery findings to design against

- 8 identical streaming-handler shapes across 5+ files
- All share AbortController lifecycle, push callback, envelope-emission
  pattern
- Variation is only in: channel name, log component, and the actual
  `AsyncIterable<T>` producer
- The `electron-ipc-test-harness` pattern means tests don't depend on
  the defining file, so refactor risk is bounded

## Out of scope

- Changing envelope shape or wire format
- Changing cancel semantics
- Adding new validation (separate behavior-changing concern — see
  `feature-ipc-envelope-validation-coverage`)

## Acceptance Criteria

- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (every `*-channel-envelope.test.ts` and the
      streaming-channel error-redaction tests pass unmodified)
- [ ] All 8 streaming channels use the new helper
- [ ] Total LoC of streaming scaffolding (grep for `activeAbortControllers.set\|new AbortController` in `packages/desktop/electron/main/`) drops by ≥300 lines
- [ ] Cancel semantics preserved — verified by
      `streaming-channel-error-redaction.test.ts` and any cancel-path
      coverage

## Risk

**Low** — wire format is fully preserved, tests exercise the captured
handlers (independent of defining file), and the pattern is already used
correctly in 8 places (so the canonical shape is well-defined).

## Rollback

`git revert <commit>` per channel adoption is clean; revert order is
inverse of adoption.
