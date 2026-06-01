import type { ClientTransport } from "./types.js";

/**
 * The subset of Electron's ipcRenderer API exposed via contextBridge.
 * `window.praxis` implements this interface in the renderer.
 */
export interface PraxisIpcBridge {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (data: unknown) => void): () => void;
  send(channel: string, ...args: unknown[]): void;
}

/**
 * A message pushed over a per-stream IPC channel.
 * Discriminated by the `kind` field.
 */
export type IpcStreamMessage<T> =
  | { kind: "event"; payload: T }
  | { kind: "done" }
  | { kind: "error"; error: string };

export class IpcStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IpcStreamError";
  }
}

const streamIdPrefix = createRandomStreamIdPrefix();
let streamCounter = 0;

function createIpcStreamId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid !== undefined) return `stream-${uuid}`;
  return `stream-${streamIdPrefix}-${++streamCounter}`;
}

function createRandomStreamIdPrefix(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  if (bytes.some((byte) => byte !== 0)) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

/**
 * Convert an IPC push-channel into a pull-based AsyncIterable.
 *
 * Protocol:
 *  1. Subscribe to `praxis.session.send.events.<streamId>` BEFORE invoking start.
 *  2. Invoke `praxis.session.send.start` with the streamId + payload.
 *  3. Server pushes IpcStreamMessage<T> values.
 *  4. When the consumer breaks out early, send `praxis.session.send.cancel`.
 *
 * @param bridge  The contextBridge object exposed by the preload.
 * @param startChannel  Channel to invoke to start the stream.
 * @param eventsChannelPrefix  Prefix for per-stream event channel (eventsChannelPrefix + streamId).
 * @param cancelChannel  Channel to send when the consumer cancels.
 * @param args  Arguments forwarded to the start invoke (after streamId).
 */
export function streamAsAsyncIterable<T>(
  bridge: PraxisIpcBridge,
  startChannel: string,
  eventsChannelPrefix: string,
  cancelChannel: string,
  args: unknown[],
): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      const streamId = createIpcStreamId();
      const eventsChannel = `${eventsChannelPrefix}${streamId}`;

      // Queue for received events; wakeup resolves the pending next() call.
      const queue: Array<IpcStreamMessage<T>> = [];
      let wakeup: (() => void) | null = null;
      let unsubscribe: (() => void) | null = null;
      let done = false;

      const wake = (): void => {
        if (wakeup) {
          const w = wakeup;
          wakeup = null;
          w();
        }
      };

      const push = (msg: IpcStreamMessage<T>): void => {
        if (done) return;
        queue.push(msg);
        wake();
      };

      // Subscribe before invoking start — no race condition.
      const removeListener = bridge.on(eventsChannel, (data: unknown) => {
        push(data as IpcStreamMessage<T>);
      });
      unsubscribe = removeListener;

      // Kick off the stream. Startup failures can happen before the main
      // process can push an error event, so surface them through this iterator.
      bridge.invoke(startChannel, streamId, ...args).catch((err: unknown) => {
        push({
          kind: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      });

      return {
        async next(): Promise<IteratorResult<T, undefined>> {
          while (queue.length === 0 && !done) {
            await new Promise<void>((resolve) => {
              wakeup = resolve;
            });
          }

          const msg = queue.shift();
          if (!msg) {
            return { done: true, value: undefined };
          }

          if (msg.kind === "done") {
            done = true;
            unsubscribe?.();
            return { done: true, value: undefined };
          }

          if (msg.kind === "error") {
            done = true;
            unsubscribe?.();
            throw new IpcStreamError(msg.error);
          }

          return { done: false, value: msg.payload };
        },
        async return(): Promise<IteratorResult<T, undefined>> {
          if (!done) {
            done = true;
            unsubscribe?.();
            bridge.send(cancelChannel, streamId);
          }
          return { done: true, value: undefined };
        },
      };
    },
  };
}

/**
 * Create an IpcTransport backed by Electron's contextBridge.
 *
 * Stream channel naming convention (matches IPC server in @praxis/desktop):
 *   start:   `praxis.session.send.start`
 *   events:  `praxis.session.send.events.<streamId>`
 *   cancel:  `praxis.session.send.cancel`
 *
 * For generic streaming (other channels) the transport uses the same pattern
 * with configurable channel names.
 */
export function createIpcTransport(bridge: PraxisIpcBridge): ClientTransport {
  return {
    invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
      return bridge.invoke(channel, ...args) as Promise<T>;
    },

    send(channel: string, ...args: unknown[]): void {
      bridge.send(channel, ...args);
    },

    stream<T>(channel: string, ...args: unknown[]): AsyncIterable<T> {
      // Derive per-stream channels from the base channel name.
      // e.g. "praxis.session.send" → start: "praxis.session.send.start"
      //                            → events: "praxis.session.send.events."
      //                            → cancel: "praxis.session.send.cancel"
      const startChannel = `${channel}.start`;
      const eventsChannelPrefix = `${channel}.events.`;
      const cancelChannel = `${channel}.cancel`;
      return streamAsAsyncIterable<T>(
        bridge,
        startChannel,
        eventsChannelPrefix,
        cancelChannel,
        args,
      );
    },
  };
}
