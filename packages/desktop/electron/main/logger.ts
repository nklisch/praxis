import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Logger, LogLevel, LogRecord } from "@praxis/core/types";
import type { Logger as PinoInstance } from "pino";
import pino from "pino";

const REDACT_PATHS = [
  "apiKey",
  "authorization",
  "password",
  "lockCode",
  "*.apiKey",
  "*.authorization",
  "*.password",
  "*.lockCode",
  "config.apiKey",
  "engineConfig.apiKey",
  "headers.authorization",
  "headers.Authorization",
] as const;

const PROMPT_FIELD_NAMES = ["prompt", "messages", "modelOutput", "systemPrompt"] as const;

export interface MainLoggerOptions {
  level: LogLevel;
  /** Absolute path to JSONL log file. When undefined, no file output. */
  filePath?: string;
  /** Max single file size in MB before rotation. */
  maxFileSizeMb: number;
  /** Max number of rotated files retained. */
  maxFiles: number;
  /** Pretty-print to stdout. true in dev, false in packaged builds. */
  pretty: boolean;
  /** When false, fields named in PROMPT_FIELD_NAMES are replaced with "[REDACTED]". */
  prompts: boolean;
  /** Bindings present on every record (e.g., `{ pid, version }`). */
  baseBindings?: Record<string, unknown>;
}

/**
 * The main-process Logger. Wraps a pino instance with the Praxis Logger contract,
 * adds prompt redaction, and exposes ingestion for renderer-forwarded records.
 */
export interface MainLogger extends Logger {
  /**
   * Emit a record received from the renderer process. The record's `level`,
   * `message`, `fields`, and `bindings` are preserved; pino tags it with
   * `source: "renderer"` so origin is recoverable from the log.
   */
  ingestRendererRecord(record: LogRecord): void;
  /**
   * Flush transports and close the file stream. Called from `app.before-quit`.
   */
  shutdown(): Promise<void>;
}

export function createMainLogger(opts: MainLoggerOptions): MainLogger {
  if (opts.filePath) mkdirSync(dirname(opts.filePath), { recursive: true });

  const targets: Array<{ target: string; level: LogLevel; options: Record<string, unknown> }> = [];

  if (opts.pretty) {
    targets.push({
      target: "pino-pretty",
      level: opts.level,
      options: {
        colorize: true,
        translateTime: "HH:MM:ss.l",
        ignore: "pid,hostname",
        singleLine: false,
      },
    });
  } else {
    // Production stdout: JSONL (one record per line).
    targets.push({
      target: "pino/file",
      level: opts.level,
      options: { destination: 1 }, // 1 = stdout fd
    });
  }

  if (opts.filePath) {
    targets.push({
      target: "pino-roll",
      level: opts.level,
      options: {
        file: opts.filePath,
        size: `${opts.maxFileSizeMb}m`,
        limit: { count: opts.maxFiles },
        mkdir: true,
      },
    });
  }

  const transport = pino.transport({ targets });

  const root = pino(
    {
      level: opts.level,
      base: { ...(opts.baseBindings ?? {}) },
      timestamp: pino.stdTimeFunctions.epochTime,
      redact: { paths: [...REDACT_PATHS], censor: "[REDACTED]" },
      formatters: {
        level: (label) => ({ level: label }),
      },
    },
    transport,
  );

  return wrap(root, opts.prompts, transport);
}

/**
 * Pino's worker transport (thread-stream) needs end() + the 'finish' event
 * to drain the worker before the process exits. flush() only asks the local
 * side to push pending bytes; without waiting for the transport to finish,
 * the final records can be truncated when app.exit() runs immediately after
 * shutdown().
 *
 * Note: thread-stream's end(cb) does NOT fire the callback reliably — listen
 * for the 'finish' event instead. Verified empirically against pino@9.
 *
 * Typed loosely because pino's public surface doesn't export the
 * thread-stream type directly; the methods used here are stable.
 */
interface TransportStreamLike {
  end: () => void;
  once: (event: "finish" | "close" | "end", listener: () => void) => unknown;
}

/**
 * Wraps a pino instance in the Praxis MainLogger contract. Exported as a
 * test seam — production code should call `createMainLogger`. Tests can
 * construct a sync-destination pino and pass it here to verify wrapper
 * behavior (redaction, child bindings, ingestRendererRecord) without
 * spinning up worker-thread transports.
 *
 * @internal
 */
export function wrapPinoForTesting(
  pinoInstance: PinoInstance,
  allowPrompts: boolean,
): MainLogger {
  return wrap(pinoInstance, allowPrompts);
}

function wrap(
  pinoInstance: PinoInstance,
  allowPrompts: boolean,
  transport?: TransportStreamLike,
): MainLogger {
  const guard = (fields?: Record<string, unknown>): Record<string, unknown> | undefined => {
    if (!fields || allowPrompts) return fields;
    let copy: Record<string, unknown> | undefined;
    for (const name of PROMPT_FIELD_NAMES) {
      if (name in fields && fields[name] !== undefined) {
        copy ??= { ...fields };
        copy[name] = "[REDACTED]";
      }
    }
    return copy ?? fields;
  };

  const wrapped: MainLogger = {
    debug: (msg, fields) => pinoInstance.debug(guard(fields) ?? {}, msg),
    info: (msg, fields) => pinoInstance.info(guard(fields) ?? {}, msg),
    warn: (msg, fields) => pinoInstance.warn(guard(fields) ?? {}, msg),
    error: (msg, fields) => pinoInstance.error(guard(fields) ?? {}, msg),
    // Children share the same transport — only the root needs to drive shutdown.
    child: (bindings) => wrap(pinoInstance.child(bindings), allowPrompts),
    ingestRendererRecord: (record) => {
      const merged = { ...(record.bindings ?? {}), source: "renderer" as const };
      const child = pinoInstance.child(merged);
      const fields = guard(record.fields);
      child[record.level](fields ?? {}, record.message);
    },
    shutdown: async () => {
      // Step 1: ask pino to flush its in-process buffer to the transport.
      await new Promise<void>((resolve) => pinoInstance.flush(() => resolve()));
      // Step 2: end the transport stream and wait for it to drain. Listen
      // for 'finish' (callback to .end() does not fire reliably under pino's
      // thread-stream). Bound the wait — if the worker is wedged, prefer to
      // exit anyway rather than hang forever on shutdown.
      if (transport) {
        await new Promise<void>((resolve) => {
          let settled = false;
          const done = (): void => {
            if (settled) return;
            settled = true;
            resolve();
          };
          transport.once("finish", done);
          transport.once("close", done);
          transport.end();
          // 2s ceiling — the worker normally drains in ~30ms; any longer
          // means something is stuck and we should not hold up app.exit().
          setTimeout(done, 2000).unref?.();
        });
      }
    },
  };
  return wrapped;
}
