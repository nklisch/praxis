import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Logger, LogLevel, LogRecord } from "@praxis/core/types";
import type { DestinationStream, Logger as PinoInstance, StreamEntry } from "pino";
import pino from "pino";
import pretty from "pino-pretty";
import buildPinoRoll from "pino-roll";

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

/**
 * Minimal contract for streams pino's `multistream` accepts. Each underlying
 * stream (pino-pretty, pino-roll's SonicBoom) has a `flushSync()` and an
 * `end()`; we wait for the corresponding `finish` / `close` to drain before
 * resolving shutdown. This shape avoids reaching into pino internals.
 */
interface FlushableStream {
  flushSync?: () => void;
  end?: () => void;
  once?: (event: "finish" | "close" | "end" | "drain", cb: () => void) => unknown;
  on?: (event: "error", cb: (err: unknown) => void) => unknown;
}

export async function createMainLogger(opts: MainLoggerOptions): Promise<MainLogger> {
  if (opts.filePath) mkdirSync(dirname(opts.filePath), { recursive: true });

  // We deliberately use `pino.multistream` with in-process streams (one for
  // pretty stdout, one for the rolling file) rather than `pino.transport({
  // targets })` with worker-thread targets. The worker-thread approach has
  // silent-failure modes in environments with unusual stdio handling
  // (Electron's main process, Vitest's stdio capture) where the transport
  // appears to initialize but no records reach disk. Multistream runs every
  // stream on the main thread so failures are observable and writes are
  // synchronous-ish (flushed each tick by sonic-boom).
  const streams: StreamEntry<LogLevel>[] = [];
  const flushables: FlushableStream[] = [];

  if (opts.pretty) {
    const prettyStream = pretty({
      colorize: true,
      translateTime: "HH:MM:ss.l",
      ignore: "pid,hostname",
      singleLine: false,
      destination: 1, // stdout fd
    });
    streams.push({ stream: prettyStream as unknown as DestinationStream, level: opts.level });
    flushables.push(prettyStream as unknown as FlushableStream);
  } else {
    // Production: JSONL to stdout via raw fd (no formatting).
    const stdoutStream = pino.destination({ dest: 1, sync: false });
    streams.push({ stream: stdoutStream, level: opts.level });
    flushables.push(stdoutStream as unknown as FlushableStream);
  }

  if (opts.filePath) {
    // pino-roll@3 returns a SonicBoom stream from `build()`. Running it
    // in-process (not via pino.transport target) is the load-bearing change
    // for reliable file output — see the comment above multistream.
    const fileStream = await buildPinoRoll({
      file: opts.filePath,
      size: `${opts.maxFileSizeMb}m`,
      limit: { count: opts.maxFiles },
      mkdir: true,
    });
    fileStream.on?.("error", (err: unknown) => {
      // Surface file-stream errors to stderr so they can't fail silently.
      // Logger errors going to the logger itself would loop; stderr is the
      // backstop.
      console.error("praxis.logger.file_stream_error", err);
    });
    streams.push({ stream: fileStream as DestinationStream, level: opts.level });
    flushables.push(fileStream as FlushableStream);
  }

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
    pino.multistream(streams),
  );

  return wrap(root, opts.prompts, flushables);
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
export function wrapPinoForTesting(pinoInstance: PinoInstance, allowPrompts: boolean): MainLogger {
  return wrap(pinoInstance, allowPrompts);
}

function wrap(
  pinoInstance: PinoInstance,
  allowPrompts: boolean,
  flushables?: FlushableStream[],
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
      // Step 1: ask pino to flush its in-process buffer.
      await new Promise<void>((resolve) => pinoInstance.flush(() => resolve()));
      // Step 2: end each underlying stream and wait for it to drain. Bound the
      // wait per stream — a stuck stream shouldn't hold up app.exit().
      if (!flushables) return;
      await Promise.all(
        flushables.map(
          (stream) =>
            new Promise<void>((resolve) => {
              let settled = false;
              const done = (): void => {
                if (settled) return;
                settled = true;
                resolve();
              };
              try {
                stream.flushSync?.();
              } catch {
                // best-effort sync flush
              }
              stream.once?.("finish", done);
              stream.once?.("close", done);
              try {
                stream.end?.();
              } catch {
                done();
              }
              setTimeout(done, 2000).unref?.();
            }),
        ),
      );
    },
  };
  return wrapped;
}
