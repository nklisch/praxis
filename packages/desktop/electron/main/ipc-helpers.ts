import type { Logger } from "@praxis/core/types";
import { serializeErrorRedacted } from "@praxis/core/types";
import type { IpcMainInvokeEvent } from "electron";
import { ipcMain } from "electron";

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
