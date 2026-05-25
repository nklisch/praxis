import type { Logger } from "@praxis/core/types";
import { serializeErrorRedacted } from "@praxis/core/types";
import type { IpcMainInvokeEvent } from "electron";
import { ipcMain } from "electron";
import type { z } from "zod";
import type { IpcEnvelope } from "./ipc-error-envelope.js";
import { withSchema, wrapEnvelope } from "./ipc-error-envelope.js";

export interface IpcHandlerHelpers {
  /**
   * Register an `ipcMain.handle` channel with uniform timing + error logging.
   * Errors are logged via `log.error("ipc.handle.error", { channel, durationMs, err })`
   * and re-thrown so the client receives a normal IPC rejection.
   *
   * Slow calls (>200ms) are logged at `info` with `ipc.handle.slow`.
   */
  handle: (
    channel: string,
    // biome-ignore lint/suspicious/noExplicitAny: handler signatures vary per channel
    fn: (event: IpcMainInvokeEvent, ...args: any[]) => unknown | Promise<unknown>,
  ) => void;
  /**
   * Register an `ipcMain.on` channel (fire-and-forget). Errors from the handler
   * are logged but never re-thrown (ipcMain.on has no rejection path).
   */
  on: (
    channel: string,
    // biome-ignore lint/suspicious/noExplicitAny: handler signatures vary per channel
    fn: (event: Electron.IpcMainEvent, ...args: any[]) => unknown | Promise<unknown>,
  ) => void;
}

const SLOW_CALL_THRESHOLD_MS = 200;

/**
 * Compose `wrapEnvelope + withSchema` into a single handler function whose
 * signature matches `ipcMain.handle`'s `(event, payload)` calling convention.
 *
 * The IPC timing wrapper in `createIpcHelpers.handle` always calls
 * `fn(event, ...args)`, so the first argument the registered function receives
 * is the Electron IpcMainInvokeEvent — not the payload. `handleEnvelope`
 * strips the event, forwards only `payload` to `withSchema`, and wraps the
 * whole call in `wrapEnvelope` so failures are returned as a discriminated
 * envelope rather than a rejected promise.
 *
 * Usage in ipc-server.ts:
 *   handle(
 *     "praxis.lock.setLockCode",
 *     handleEnvelope("praxis.lock.setLockCode", log, z.string().min(1), async (code) =>
 *       services.lock.setLockCode({ code }),
 *     ),
 *   );
 */
export function handleEnvelope<TIn, TOut>(
  channel: string,
  log: Logger,
  schema: z.ZodType<TIn>,
  fn: (input: TIn) => Promise<TOut> | TOut,
): (_event: IpcMainInvokeEvent, payload: unknown) => Promise<IpcEnvelope<TOut>> {
  const inner = withSchema(schema, fn);
  const wrapped = wrapEnvelope(channel, log, inner);
  return (_event: IpcMainInvokeEvent, payload: unknown): Promise<IpcEnvelope<TOut>> =>
    wrapped(payload);
}

/**
 * Guard used by every author-* and config IPC channel to reject calls when the
 * configure surface is locked. Throws with a uniform message that the client
 * can pattern-match on.
 *
 * Usage: `await requireUnlocked(services);` at the top of each envelope handler.
 */
export const requireUnlocked = async (services: {
  lock: { isUnlocked(): Promise<boolean> };
}): Promise<void> => {
  const unlocked = await services.lock.isUnlocked();
  if (!unlocked) {
    throw new Error(
      "Locked: configure surface requires unlock. Call praxis.lock.unlock first.",
    );
  }
};

export function createIpcHelpers(log: Logger): IpcHandlerHelpers {
  return {
    handle: (channel, fn) => {
      const channelLog = log.child({ component: "ipc", channel });
      ipcMain.handle(channel, async (event, ...args) => {
        const t0 = performance.now();
        try {
          const result = await fn(event, ...args);
          const durationMs = Math.round(performance.now() - t0);
          if (durationMs > SLOW_CALL_THRESHOLD_MS) {
            channelLog.info("ipc.handle.slow", { durationMs });
          } else {
            channelLog.debug("ipc.handle.ok", { durationMs });
          }
          return result;
        } catch (err) {
          const durationMs = Math.round(performance.now() - t0);
          channelLog.error("ipc.handle.error", { durationMs, err: serializeErrorRedacted(err) });
          throw err;
        }
      });
    },
    on: (channel, fn) => {
      const channelLog = log.child({ component: "ipc", channel });
      ipcMain.on(channel, async (event, ...args) => {
        try {
          await fn(event, ...args);
        } catch (err) {
          channelLog.error("ipc.on.error", { err: serializeErrorRedacted(err) });
        }
      });
    },
  };
}
