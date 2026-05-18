---
id: refactor-stream-handler-template-step-1-helper-and-activity
kind: story
stage: implementing
tags: [refactor]
parent: refactor-stream-handler-template
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Step 1: add stream-handler.ts module and adopt in activity-channel.ts

## Brief

Add the shared streaming helper at
`packages/desktop/electron/main/stream-handler.ts`. Export
`registerSubscriberStream` (Shape A) and `registerGeneratorStream` (Shape B)
plus the `StreamHandlerDeps` interface. Adopt in `activity-channel.ts` as the
reference implementation — the simplest subscriber-style channel with no
filter arg and no per-event extras.

This is the foundational step. Steps 2-4 each depend on this landing.

## Files

- `packages/desktop/electron/main/stream-handler.ts` (NEW)
- `packages/desktop/electron/main/activity-channel.ts` (rewritten to use helper)

## Helper API (sketch — confirm during implementation)

```ts
import type { IpcStreamMessage } from "@praxis/client";
import type { Logger } from "@praxis/core/types";
import { redactSecrets, serializeErrorRedacted } from "@praxis/core/types";

type HandleFn = (
  channel: string,
  fn: (event: unknown, ...args: unknown[]) => unknown,
) => void;

type OnFn = (
  channel: string,
  fn: (event: unknown, ...args: unknown[]) => unknown,
) => void;

export interface StreamHandlerDeps {
  readonly channelBase: string;
  readonly log: Logger;
  readonly webContentsGetter: () => Electron.WebContents | null;
  readonly activeAbortControllers: Map<string, AbortController>;
}

export function registerSubscriberStream<E, Args extends readonly unknown[] = []>(
  deps: StreamHandlerDeps,
  helpers: { handle: HandleFn; on: OnFn },
  opts: {
    subscribe: (cb: (event: E) => void, args: Args) => () => void;
    onEvent?: (event: E, ctx: { log: Logger }) => void;
  },
): void { /* impl per design */ }

export function registerGeneratorStream<E, Args extends readonly unknown[] = []>(
  deps: StreamHandlerDeps,
  helpers: { handle: HandleFn; on: OnFn },
  opts: {
    iterate: (args: Args, signal: AbortSignal) => AsyncIterable<E>;
    onEvent?: (event: E, ctx: { count: number; log: Logger }) => void;
    onDone?: (ctx: { count: number; durationMs: number; log: Logger }) => void;
  },
): void { /* impl per design */ }
```

Internal `setupStream<E>(deps, streamId)` helper (file-private) handles the
common scaffolding (controller register, push w/ WebContents guard, child log,
teardown).

## Channel-name derivation

The helper derives full channel names from `channelBase`:
- `${channelBase}.start` → main handler
- `${channelBase}.events.${streamId}` → push target
- `${channelBase}.cancel` → cancel handler

For activity, `channelBase = "praxis.activity.events"` so the start handler
becomes `"praxis.activity.events.start"`, push target
`"praxis.activity.events.events.<id>"`, cancel `"praxis.activity.events.cancel"`.
**That double `.events` is intentional** — it matches the existing channel
names and the renderer-side `streamBase` literal in
`packages/client/src/transport/ipc.ts` and similar. **DO NOT** "fix" the
apparent doubling — that's the wire-format and changing it would break the
renderer.

## activity-channel.ts target shape

```ts
import type { ActivityEvent, Logger } from "@praxis/core/types";
import { wrapEnvelope } from "./ipc-error-envelope.js";
import { createIpcHelpers } from "./ipc-helpers.js";
import { registerSubscriberStream } from "./stream-handler.js";
import type { Services } from "./services.js";

export function registerActivityHandlers(
  services: Services,
  webContentsGetter: () => Electron.WebContents | null,
  activeAbortControllers: Map<string, AbortController>,
  log: Logger,
): void {
  const { handle, on } = createIpcHelpers(log);

  handle(
    "praxis.activity.dismiss",
    wrapEnvelope("praxis.activity.dismiss", log, async (_event: unknown, id: string) => {
      services.activity.dismiss(id);
    }),
  );

  registerSubscriberStream<ActivityEvent>(
    {
      channelBase: "praxis.activity.events",
      log,
      webContentsGetter,
      activeAbortControllers,
    },
    { handle, on },
    { subscribe: (cb) => services.activity.subscribe(cb) },
  );
}
```

Expected LoC: ~30 (was 77).

## Implementation notes

- The default open/close log-key naming the existing channels use is
  `"<short>.subscribe"` / `"<short>.unsubscribe"` (subscriber) and
  `"<channelBase>.start"` / `"<channelBase>.done"` (generator). Pick a
  consistent shape — recommend deriving from `channelBase` for both
  shapes (so close-log is `"praxis.activity.events.unsubscribe"`).
  Drop the bespoke "short" form unless ops dashboards depend on the
  old names — note in implementation notes if you encounter that.
- For the `Args extends readonly unknown[] = []` generic: the renderer
  invokes `ipcRenderer.invoke(channel, streamId, ...args)`. The handler
  signature is `async (_event, streamId, ...args)`. The helper should
  splat `args` into the `subscribe`/`iterate` callback's `Args` tuple.
- `setupStream<E>` returns `{ streamLog, push, signal, teardown }`. The
  helper functions wrap try/catch/finally around the inner subscribe or
  iterate body.
- Error path uses `serializeErrorRedacted(err)` for the log and
  `redactSecrets(err instanceof Error ? err.message : String(err))` for
  the wire payload. Match the existing pattern exactly.

## Tests to verify

- `packages/desktop/electron/main/__tests__/streaming-channel-error-redaction.test.ts`
  — covers cancel + error paths; must pass unmodified
- Any activity-channel envelope test (grep for `"praxis.activity"` in
  `__tests__/`)
- Full test sweep: `pnpm --filter @praxis/desktop test`

If a test asserts on the exact prior log-key strings ("activity.subscribe" /
"activity.unsubscribe"), update either the assertion to the new derived form
OR keep the log key naming compatible during this step. Recommend keeping
compatibility — derive the short component name from `channelBase` strip and
emit identical keys.

## Acceptance criteria

- [ ] `pnpm typecheck && pnpm lint && pnpm test` green from repo root
      (baseline preserved — pre-existing UI typecheck errors and `.mockups/**`
      lint errors don't count)
- [ ] `packages/desktop/electron/main/stream-handler.ts` exports
      `StreamHandlerDeps`, `registerSubscriberStream`, `registerGeneratorStream`
- [ ] `wc -l packages/desktop/electron/main/activity-channel.ts` ≤ 40
- [ ] No wire-format change — `praxis.activity.events.start`,
      `praxis.activity.events.events.<id>`, `praxis.activity.events.cancel`
      all preserved
- [ ] `praxis.activity.dismiss` still works (untouched, but verify the file
      compiles and lints)
- [ ] Existing streaming envelope tests pass unmodified

## Risk

**Low** — pattern is established in 7 channels, helper just consolidates the
scaffolding. Wire format preserved. Reference impl in activity-channel is the
simplest case (no filter, no per-event hook, no extra args).

## Rollback

`git revert <commit>` — clean. The helper file becomes dead code until
subsequent steps land; deleting it is free.
