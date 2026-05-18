/**
 * Reusable streaming IPC channel scaffolding.
 *
 * Eliminates the ~60-line boilerplate that every streaming channel duplicates:
 * AbortController lifecycle, push callback with WebContents-alive guard,
 * envelope emission (`{kind:"event"|"done"|"error"}`), error logging with
 * redactSecrets / serializeErrorRedacted, finally-cleanup, and the companion
 * `*.cancel` handler.
 *
 * Two factory variants, one per stream shape:
 *   - `registerSubscriberStream` — `service.subscribe(cb)` returns `unsubscribe()`
 *   - `registerGeneratorStream`  — `service(args, signal)` returns `AsyncIterable<E>`
 *
 * Channel name derivation from `channelBase` (e.g. `"praxis.activity.events"`):
 *   - Start handler:    `${channelBase}.start`
 *   - Push target:      `${channelBase}.events.${streamId}`
 *   - Cancel handler:   `${channelBase}.cancel`
 *
 * Log keys are derived from `channelBase` by stripping the leading `"praxis."`:
 *   - Subscriber open:  `${logPrefix}.subscribe`
 *   - Subscriber close: `${logPrefix}.unsubscribe`
 *   - Generator open:   `${logPrefix}.start`
 *   - Generator close:  `${logPrefix}.done`
 *   - Error:            `${logPrefix}.error`
 */

import type { IpcStreamMessage } from "@praxis/client";
import type { Logger } from "@praxis/core/types";
import { redactSecrets, serializeErrorRedacted } from "@praxis/core/types";
import type { IpcHandlerHelpers } from "./ipc-helpers.js";

export interface StreamHandlerDeps {
  /** e.g. "praxis.activity.events" — .start / .events.<id> / .cancel are derived */
  readonly channelBase: string;
  readonly log: Logger;
  readonly webContentsGetter: () => Electron.WebContents | null;
  readonly activeAbortControllers: Map<string, AbortController>;
}

// ── Internal primitive ────────────────────────────────────────────────────────

interface StreamSetup<E> {
  streamLog: Logger;
  push: (msg: IpcStreamMessage<E>) => void;
  signal: AbortSignal;
  teardown: () => void;
}

/**
 * File-private. Registers a stream in the controllers map, builds the child
 * logger, and returns the push callback + teardown.
 */
function setupStream<E>(deps: StreamHandlerDeps, streamId: string): StreamSetup<E> {
  const { log, channelBase, webContentsGetter, activeAbortControllers } = deps;
  const logPrefix = channelBase.replace(/^praxis\./, "");
  const streamLog = log.child({ component: logPrefix, streamId });
  const controller = new AbortController();
  activeAbortControllers.set(streamId, controller);
  const eventsChannel = `${channelBase}.events.${streamId}`;

  const push = (msg: IpcStreamMessage<E>): void => {
    const wc = webContentsGetter();
    if (!wc || wc.isDestroyed()) return;
    wc.send(eventsChannel, msg);
  };

  const teardown = (): void => {
    activeAbortControllers.delete(streamId);
  };

  return { streamLog, push, signal: controller.signal, teardown };
}

// ── Shape A: subscriber-callback ──────────────────────────────────────────────

/**
 * Register a subscriber-style streaming IPC channel.
 *
 * The renderer invokes `${channelBase}.start` with `(streamId, ...args)`.
 * The helper calls `opts.subscribe(cb, args)` which returns an `unsubscribe`
 * function, and holds open via an AbortController until the renderer sends
 * `${channelBase}.cancel`.
 *
 * @param deps    - Channel base name, logger, WebContents getter, controllers map
 * @param helpers - `{ handle, on }` from `createIpcHelpers(log)`
 * @param opts    - `subscribe(cb, args)` returns unsubscribe; optional `onEvent` hook
 */
export function registerSubscriberStream<E, Args extends readonly unknown[] = readonly []>(
  deps: StreamHandlerDeps,
  helpers: IpcHandlerHelpers,
  opts: {
    subscribe: (cb: (event: E) => void, args: Args) => () => void;
    onEvent?: (event: E, ctx: { log: Logger }) => void;
  },
): void {
  const { channelBase } = deps;
  const { handle, on } = helpers;
  const logPrefix = channelBase.replace(/^praxis\./, "");

  handle(`${channelBase}.start`, async (_event: unknown, streamId: string, ...rest: unknown[]) => {
    const args = rest as unknown as Args;
    const { streamLog, push, signal, teardown } = setupStream<E>(deps, streamId);

    streamLog.info(`${logPrefix}.subscribe`);
    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = opts.subscribe((event) => {
        if (signal.aborted) return;
        opts.onEvent?.(event, { log: streamLog });
        push({ kind: "event", payload: event });
      }, args);

      // Hold open until cancelled via the companion cancel handler.
      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true });
      });

      push({ kind: "done" });
      streamLog.info(`${logPrefix}.unsubscribe`);
    } catch (err) {
      streamLog.error(`${logPrefix}.error`, { err: serializeErrorRedacted(err) });
      push({
        kind: "error",
        error: redactSecrets(err instanceof Error ? err.message : String(err)),
      });
    } finally {
      unsubscribe?.();
      teardown();
    }
  });

  on(`${channelBase}.cancel`, (_event: unknown, streamId: string) => {
    deps.activeAbortControllers.get(streamId)?.abort();
    deps.activeAbortControllers.delete(streamId);
  });
}

// ── Shape B: async-generator ──────────────────────────────────────────────────

/**
 * Register a generator-style streaming IPC channel.
 *
 * The renderer invokes `${channelBase}.start` with `(streamId, ...args)`.
 * The helper calls `opts.iterate(args, signal)` which returns an `AsyncIterable<E>`,
 * drains it with `for await`, and pushes each event. The `signal` is passed into
 * the producer so producers that accept it can cascade abort downstream.
 *
 * @param deps    - Channel base name, logger, WebContents getter, controllers map
 * @param helpers - `{ handle, on }` from `createIpcHelpers(log)`
 * @param opts    - `iterate(args, signal)` returns AsyncIterable; optional hooks
 */
export function registerGeneratorStream<E, Args extends readonly unknown[] = readonly []>(
  deps: StreamHandlerDeps,
  helpers: IpcHandlerHelpers,
  opts: {
    iterate: (args: Args, signal: AbortSignal) => AsyncIterable<E>;
    onEvent?: (event: E, ctx: { count: number; log: Logger }) => void;
    onDone?: (ctx: { count: number; durationMs: number; log: Logger }) => void;
  },
): void {
  const { channelBase } = deps;
  const { handle, on } = helpers;
  const logPrefix = channelBase.replace(/^praxis\./, "");

  handle(`${channelBase}.start`, async (_event: unknown, streamId: string, ...rest: unknown[]) => {
    const args = rest as unknown as Args;
    const { streamLog, push, signal, teardown } = setupStream<E>(deps, streamId);
    const t0 = performance.now();
    let count = 0;

    streamLog.info(`${logPrefix}.start`);
    try {
      const stream = opts.iterate(args, signal);
      for await (const event of stream) {
        if (signal.aborted) break;
        count++;
        opts.onEvent?.(event, { count, log: streamLog });
        push({ kind: "event", payload: event });
      }
      push({ kind: "done" });
      const durationMs = Math.round(performance.now() - t0);
      if (opts.onDone) {
        opts.onDone({ count, durationMs, log: streamLog });
      } else {
        streamLog.info(`${logPrefix}.done`, { durationMs, eventCount: count });
      }
    } catch (err) {
      const durationMs = Math.round(performance.now() - t0);
      streamLog.error(`${logPrefix}.error`, {
        durationMs,
        eventCount: count,
        err: serializeErrorRedacted(err),
      });
      push({
        kind: "error",
        error: redactSecrets(err instanceof Error ? err.message : String(err)),
      });
    } finally {
      teardown();
    }
  });

  on(`${channelBase}.cancel`, (_event: unknown, streamId: string) => {
    deps.activeAbortControllers.get(streamId)?.abort();
    deps.activeAbortControllers.delete(streamId);
  });
}
