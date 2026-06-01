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
import type { DebugTraceContext, DebugTraceRegistry, Logger, SessionId } from "@praxis/core/types";
import { redactSecrets, serializeErrorRedacted } from "@praxis/core/types";
import type { IpcHandlerHelpers } from "./ipc-helpers.js";

export interface StreamHandlerDeps {
  /** e.g. "praxis.activity.events" — .start / .events.<id> / .cancel are derived */
  readonly channelBase: string;
  readonly log: Logger;
  readonly webContentsGetter: () => Electron.WebContents | null;
  readonly activeAbortControllers: Map<string, AbortController>;
  readonly debugTrace?: DebugTraceRegistry;
}

export interface StreamTraceBindings {
  readonly sessionId?: string;
  readonly parentCallId?: string;
  readonly callId?: string;
  readonly runId?: string;
}

export interface StreamEventSummary {
  readonly eventType: string;
  readonly summary?: string;
  readonly sessionId?: string;
  readonly parentCallId?: string;
  readonly callId?: string;
  readonly runId?: string;
}

interface StreamTraceState {
  readonly streamId: string;
  readonly channel: string;
  readonly logPrefix: string;
  readonly bindings: StreamTraceBindings;
}

interface StreamLifecycleCtx {
  readonly state: StreamTraceState;
  readonly eventCount: number;
  readonly eventType: string;
  readonly summary?: string;
  readonly bindings?: StreamEventSummary;
}

// ── Internal primitive ────────────────────────────────────────────────────────

interface StreamSetup<E> {
  streamLog: Logger;
  push: (msg: IpcStreamMessage<E>) => void;
  signal: AbortSignal;
  teardown: () => void;
  traceState: StreamTraceState;
}

/**
 * File-private. Registers a stream in the controllers map, builds the child
 * logger, and returns the push callback + teardown.
 */
function setupStream<E>(
  deps: StreamHandlerDeps,
  streamId: string,
  traceBindings: StreamTraceBindings | undefined,
): StreamSetup<E> {
  const { log, channelBase, webContentsGetter, activeAbortControllers } = deps;
  const logPrefix = channelBase.replace(/^praxis\./, "");
  const bindings = traceBindings ?? {};
  const streamLog = log.child({
    component: logPrefix,
    streamId,
    channel: channelBase,
    ...streamLogFields(bindings),
  });
  const controller = new AbortController();
  activeAbortControllers.set(streamId, controller);
  const eventsChannel = `${channelBase}.events.${streamId}`;
  const traceState: StreamTraceState = {
    streamId,
    channel: channelBase,
    logPrefix,
    bindings,
  };

  const push = (msg: IpcStreamMessage<E>): void => {
    const wc = webContentsGetter();
    if (!wc || wc.isDestroyed()) return;
    wc.send(eventsChannel, msg);
  };

  const teardown = (): void => {
    activeAbortControllers.delete(streamId);
  };

  return { streamLog, push, signal: controller.signal, teardown, traceState };
}

function recordStreamLifecycle(
  deps: StreamHandlerDeps,
  streamLog: Logger,
  ctx: StreamLifecycleCtx,
): void {
  const merged = mergeBindings(ctx.state.bindings, ctx.bindings);
  const fields = {
    streamId: ctx.state.streamId,
    channel: ctx.state.channel,
    eventCount: ctx.eventCount,
    eventType: ctx.eventType,
    ...streamLogFields(merged),
    ...(ctx.summary !== undefined && { summary: ctx.summary }),
  };
  streamLog.debug(`${ctx.state.logPrefix}.trace`, fields);

  if (deps.debugTrace === undefined || merged.sessionId === undefined) return;

  const trace: DebugTraceContext = {
    runId: merged.runId ?? `ipc:${ctx.state.streamId}`,
    sessionId: merged.sessionId as SessionId,
    streamId: ctx.state.streamId,
    ...(merged.parentCallId !== undefined && { parentCallId: merged.parentCallId }),
    ...(merged.callId !== undefined && { callId: merged.callId }),
  };

  try {
    deps.debugTrace.record({
      type: "ipc_stream_event",
      trace,
      channel: ctx.state.channel,
      eventType: ctx.eventType,
      eventCount: ctx.eventCount,
      ...(ctx.summary !== undefined && { summary: ctx.summary }),
    });
  } catch (err) {
    streamLog.warn(`${ctx.state.logPrefix}.trace_record_failed`, {
      err: serializeErrorRedacted(err),
    });
  }
}

function mergeBindings(
  base: StreamTraceBindings,
  override: StreamEventSummary | undefined,
): StreamTraceBindings {
  if (override === undefined) return base;
  return {
    ...base,
    ...(override.sessionId !== undefined && { sessionId: override.sessionId }),
    ...(override.parentCallId !== undefined && { parentCallId: override.parentCallId }),
    ...(override.callId !== undefined && { callId: override.callId }),
    ...(override.runId !== undefined && { runId: override.runId }),
  };
}

function mergePersistentBindings(
  base: StreamTraceBindings,
  override: StreamEventSummary | undefined,
): StreamTraceBindings {
  if (override === undefined) return base;
  return {
    ...base,
    ...(override.sessionId !== undefined && { sessionId: override.sessionId }),
    ...(override.parentCallId !== undefined && { parentCallId: override.parentCallId }),
    ...(override.runId !== undefined && { runId: override.runId }),
  };
}

function streamLogFields(bindings: StreamTraceBindings): Record<string, unknown> {
  return {
    ...(bindings.sessionId !== undefined && { sessionId: bindings.sessionId }),
    ...(bindings.parentCallId !== undefined && { parentCallId: bindings.parentCallId }),
    ...(bindings.callId !== undefined && { callId: bindings.callId }),
  };
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
    traceBindings?: (args: Args, streamId: string) => StreamTraceBindings | undefined;
    summarizeEvent?: (
      event: E,
      ctx: { args: Args; count: number; streamId: string; bindings: StreamTraceBindings },
    ) => StreamEventSummary | undefined;
  },
): void {
  const { channelBase } = deps;
  const { handle, on } = helpers;
  const logPrefix = channelBase.replace(/^praxis\./, "");
  const lifecycleStates = new Map<string, { state: StreamTraceState; eventCount: number }>();

  handle(`${channelBase}.start`, async (_event: unknown, streamId: string, ...rest: unknown[]) => {
    const args = rest as unknown as Args;
    const traceBindings = opts.traceBindings?.(args, streamId);
    const setup = setupStream<E>(deps, streamId, traceBindings);
    const { streamLog, push, signal, teardown } = setup;
    let traceState = setup.traceState;
    let count = 0;
    lifecycleStates.set(streamId, { state: traceState, eventCount: count });

    streamLog.info(`${logPrefix}.subscribe`, { channel: channelBase, eventCount: count });
    recordStreamLifecycle(deps, streamLog, {
      state: traceState,
      eventCount: count,
      eventType: "start",
    });
    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = opts.subscribe((event) => {
        if (signal.aborted) return;
        count++;
        lifecycleStates.set(streamId, { state: traceState, eventCount: count });
        const summary = opts.summarizeEvent?.(event, {
          args,
          count,
          streamId,
          bindings: traceState.bindings,
        });
        traceState = {
          ...traceState,
          bindings: mergePersistentBindings(traceState.bindings, summary),
        };
        lifecycleStates.set(streamId, { state: traceState, eventCount: count });
        recordStreamLifecycle(deps, streamLog, {
          state: traceState,
          eventCount: count,
          eventType: summary?.eventType ?? "event",
          ...(summary?.summary !== undefined && { summary: summary.summary }),
          ...(summary !== undefined && { bindings: summary }),
        });
        opts.onEvent?.(event, { log: streamLog });
        push({ kind: "event", payload: event });
      }, args);

      // Hold open until cancelled via the companion cancel handler.
      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true });
      });

      push({ kind: "done" });
      recordStreamLifecycle(deps, streamLog, {
        state: traceState,
        eventCount: count,
        eventType: "done",
      });
      streamLog.info(`${logPrefix}.unsubscribe`, { channel: channelBase, eventCount: count });
    } catch (err) {
      recordStreamLifecycle(deps, streamLog, {
        state: traceState,
        eventCount: count,
        eventType: "error",
      });
      streamLog.error(`${logPrefix}.error`, {
        channel: channelBase,
        eventCount: count,
        err: serializeErrorRedacted(err),
      });
      push({
        kind: "error",
        error: redactSecrets(err instanceof Error ? err.message : String(err)),
      });
    } finally {
      unsubscribe?.();
      lifecycleStates.delete(streamId);
      teardown();
    }
  });

  on(`${channelBase}.cancel`, (_event: unknown, streamId: string) => {
    const controller = deps.activeAbortControllers.get(streamId);
    if (controller !== undefined) {
      const lifecycle = lifecycleStates.get(streamId);
      const bindings = lifecycle?.state.bindings ?? {};
      const streamLog = deps.log.child({
        component: logPrefix,
        streamId,
        channel: channelBase,
        ...streamLogFields(bindings),
      });
      recordStreamLifecycle(deps, streamLog, {
        state: lifecycle?.state ?? {
          streamId,
          channel: channelBase,
          logPrefix,
          bindings,
        },
        eventCount: lifecycle?.eventCount ?? 0,
        eventType: "cancel",
      });
    }
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
    traceBindings?: (args: Args, streamId: string) => StreamTraceBindings | undefined;
    summarizeEvent?: (
      event: E,
      ctx: { args: Args; count: number; streamId: string; bindings: StreamTraceBindings },
    ) => StreamEventSummary | undefined;
  },
): void {
  const { channelBase } = deps;
  const { handle, on } = helpers;
  const logPrefix = channelBase.replace(/^praxis\./, "");
  const lifecycleStates = new Map<string, { state: StreamTraceState; eventCount: number }>();

  handle(`${channelBase}.start`, async (_event: unknown, streamId: string, ...rest: unknown[]) => {
    const args = rest as unknown as Args;
    const traceBindings = opts.traceBindings?.(args, streamId);
    const setup = setupStream<E>(deps, streamId, traceBindings);
    const { streamLog, push, signal, teardown } = setup;
    let traceState = setup.traceState;
    const t0 = performance.now();
    let count = 0;
    lifecycleStates.set(streamId, { state: traceState, eventCount: count });

    streamLog.info(`${logPrefix}.start`, { channel: channelBase, eventCount: count });
    recordStreamLifecycle(deps, streamLog, {
      state: traceState,
      eventCount: count,
      eventType: "start",
    });
    try {
      const stream = opts.iterate(args, signal);
      for await (const event of stream) {
        if (signal.aborted) break;
        count++;
        lifecycleStates.set(streamId, { state: traceState, eventCount: count });
        const summary = opts.summarizeEvent?.(event, {
          args,
          count,
          streamId,
          bindings: traceState.bindings,
        });
        traceState = {
          ...traceState,
          bindings: mergePersistentBindings(traceState.bindings, summary),
        };
        lifecycleStates.set(streamId, { state: traceState, eventCount: count });
        recordStreamLifecycle(deps, streamLog, {
          state: traceState,
          eventCount: count,
          eventType: summary?.eventType ?? "event",
          ...(summary?.summary !== undefined && { summary: summary.summary }),
          ...(summary !== undefined && { bindings: summary }),
        });
        opts.onEvent?.(event, { count, log: streamLog });
        push({ kind: "event", payload: event });
      }
      push({ kind: "done" });
      const durationMs = Math.round(performance.now() - t0);
      recordStreamLifecycle(deps, streamLog, {
        state: traceState,
        eventCount: count,
        eventType: "done",
      });
      if (opts.onDone) {
        opts.onDone({ count, durationMs, log: streamLog });
      } else {
        streamLog.info(`${logPrefix}.done`, {
          channel: channelBase,
          durationMs,
          eventCount: count,
        });
      }
    } catch (err) {
      const durationMs = Math.round(performance.now() - t0);
      recordStreamLifecycle(deps, streamLog, {
        state: traceState,
        eventCount: count,
        eventType: "error",
      });
      streamLog.error(`${logPrefix}.error`, {
        channel: channelBase,
        durationMs,
        eventCount: count,
        err: serializeErrorRedacted(err),
      });
      push({
        kind: "error",
        error: redactSecrets(err instanceof Error ? err.message : String(err)),
      });
    } finally {
      lifecycleStates.delete(streamId);
      teardown();
    }
  });

  on(`${channelBase}.cancel`, (_event: unknown, streamId: string) => {
    const controller = deps.activeAbortControllers.get(streamId);
    if (controller !== undefined) {
      const lifecycle = lifecycleStates.get(streamId);
      const bindings = lifecycle?.state.bindings ?? {};
      const streamLog = deps.log.child({
        component: logPrefix,
        streamId,
        channel: channelBase,
        ...streamLogFields(bindings),
      });
      recordStreamLifecycle(deps, streamLog, {
        state: lifecycle?.state ?? {
          streamId,
          channel: channelBase,
          logPrefix,
          bindings,
        },
        eventCount: lifecycle?.eventCount ?? 0,
        eventType: "cancel",
      });
    }
    deps.activeAbortControllers.get(streamId)?.abort();
    deps.activeAbortControllers.delete(streamId);
  });
}
