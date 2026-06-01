import {
  type DebugTraceRegistry,
  LOG_LEVELS,
  type LogRecord,
  type SessionId,
} from "@praxis/core/types";
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

export function registerLogChannel(log: MainLogger, debugTrace?: DebugTraceRegistry): void {
  ipcMain.on(LOG_CHANNEL, (_event, payload: unknown) => {
    if (!isLogRecord(payload)) {
      log.debug("log.record.malformed", { payload });
      return;
    }
    log.ingestRendererRecord(payload);
    recordRendererOutcome(debugTrace, log, payload);
  });
}

function recordRendererOutcome(
  debugTrace: DebugTraceRegistry | undefined,
  log: MainLogger,
  record: LogRecord,
): void {
  if (debugTrace === undefined || record.message !== "renderer.trace.outcome") return;

  const fields = record.fields;
  const sessionId = stringField(fields, "sessionId");
  const rendererEventId = stringField(fields, "rendererEventId");
  const eventType = stringField(fields, "eventType");
  const outcome = stringField(fields, "outcome");
  if (
    fields === undefined ||
    sessionId === undefined ||
    rendererEventId === undefined ||
    eventType === undefined ||
    outcome === undefined
  ) {
    log.debug("log.record.renderer_trace.malformed", { fields });
    return;
  }

  const surface =
    stringField(record.bindings, "surface") ?? stringField(fields, "surface") ?? "unknown";
  const runId = stringField(fields, "runId") ?? `renderer:${sessionId}`;
  const callId = stringField(fields, "callId");
  const streamId = stringField(fields, "streamId");
  const errorSummary = stringField(fields, "errorSummary");

  try {
    debugTrace.record({
      type: "renderer_outcome",
      trace: {
        runId,
        sessionId: sessionId as SessionId,
        rendererEventId,
        ...(callId !== undefined && { callId }),
        ...(streamId !== undefined && { streamId }),
      },
      surface,
      eventType,
      outcome,
      summary:
        errorSummary === undefined
          ? `${eventType}:${outcome}`
          : `${eventType}:${outcome} ${errorSummary}`,
    });
  } catch (err) {
    log.debug("log.record.renderer_trace.failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

function stringField(fields: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = fields?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
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
