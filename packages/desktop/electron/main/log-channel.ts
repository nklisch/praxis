import { LOG_LEVELS, type LogRecord } from "@praxis/core/types";
import { ipcMain } from "electron";
import type { MainLogger } from "./logger.js";

/**
 * Channel name: praxis.log.record (fire-and-forget; no response required).
 * The renderer pushes records via `ipcRenderer.send` (mirrored as
 * `bridge.send` in the contextBridge); the main listener forwards each valid
 * record into the main pino instance.
 *
 * Malformed records are dropped silently (and a debug-level note is emitted)
 * so a buggy renderer cannot crash the main process.
 */
export const LOG_CHANNEL = "praxis.log.record" as const;

export function registerLogChannel(log: MainLogger): void {
  ipcMain.on(LOG_CHANNEL, (_event, payload: unknown) => {
    if (!isLogRecord(payload)) {
      log.debug("log.record.malformed", { payload });
      return;
    }
    log.ingestRendererRecord(payload);
  });
}

function isLogRecord(x: unknown): x is LogRecord {
  if (!x || typeof x !== "object") return false;
  const r = x as Partial<LogRecord>;
  return (
    typeof r.level === "string" &&
    (LOG_LEVELS as readonly string[]).includes(r.level) &&
    typeof r.time === "number" &&
    typeof r.message === "string" &&
    (r.fields === undefined || (typeof r.fields === "object" && r.fields !== null)) &&
    (r.bindings === undefined || (typeof r.bindings === "object" && r.bindings !== null))
  );
}
