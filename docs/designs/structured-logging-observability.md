# Design: Structured Logging & Observability

## Overview

Praxis today logs through a `Logger` interface in `packages/core/src/types/common.ts:34` whose only concrete implementation (`packages/desktop/electron/main/services.ts:103`) is a thin wrapper over `console.{debug,info,warn,error}` with a `[praxis]` prefix. There is no file output, no log level control, no correlation across IPC streams, no renderer-process logging, and ~30 non-streamed IPC handlers in `packages/desktop/electron/main/ipc-server.ts` have no `try/catch` so their errors leak to the renderer with no record on disk. The recent PDF crash (`Warning: UnknownErrorException: standardFontDataUrl`) was undebuggable because the only artifacts were 40 identical pdfjs warnings on stdout — nothing structured, nothing persisted.

This design lands a complete observability story for v1: a `pino`-backed structured logger, a renderer→main IPC bridge that funnels every log record through one sink, child-logger correlation (sessionId, streamId, turnIndex), opt-in JSONL file rotation under `userData/logs/`, redaction of secrets and (by default) prompt content, an IPC error-wrapping helper that ends the silent-failure problem, and migration of every bare `console.*` call site in non-script code.

### Goals

- Single `Logger` port; concrete adapters for main and renderer; one unified log stream.
- Levels: `debug`, `info`, `warn`, `error` (matches today's Logger — zero call-site migration).
- Pretty stdout in dev, JSONL on disk, off by default in packaged builds (per `docs/SPEC.md:119`).
- Child loggers carry correlation context (sessionId, streamId, turnIndex, engineId, modeId, component).
- Every IPC handler logs its outcome; no error reaches the renderer without a structured record.
- Renderer logs and uncaught errors are forwarded to main and land in the same file.
- Redaction by path (`apiKey`, `authorization`, `lockCode`, etc.) and prompt-content gating behind `PRAXIS_LOG_PROMPTS=1`.
- Configurable via `config_kv` table + env overrides (matches `docs/designs` config pattern).

### Non-goals

- No metrics export (Prometheus, OpenTelemetry, Helicone) — `docs/ARCHITECTURE.md:396` flags these as future seams. We design hook points but ship no exporters.
- No structured tracing spans — child-logger bindings are sufficient for v1; OTel spans are a future seam.
- No log shipping to a hosted aggregator — local-first per `docs/SPEC.md:119`.
- No CLI script (`scripts/*.ts`) migration — those run in plain Node, get console output for human readability, and don't share the IPC bridge.

### Architecture

```
┌─────────────────── Renderer process ──────────────────┐
│                                                        │
│   React components + global handlers                   │
│              │                                         │
│              ▼                                         │
│   createRendererLogger() -> Logger                     │
│              │                                         │
│              ▼ bridge.send("praxis.log.record", rec)   │
└──────────────┼─────────────────────────────────────────┘
               │  Electron IPC (fire-and-forget)
               ▼
┌─────────────────────── Main process ─────────────────────┐
│                                                          │
│   ipcMain.on("praxis.log.record", ...)                   │
│              │                                           │
│              ▼                                           │
│   MainLogger (pino)                                      │
│       ├── pretty → stdout (dev only)                     │
│       ├── JSONL → userData/logs/praxis.log (rotated)     │
│       └── child(bindings) per scope                      │
│              ▲                                           │
│              │  injected as ServiceDeps.log              │
│   buildServices() / SessionServiceImpl / etc.            │
└──────────────────────────────────────────────────────────┘
```

The `Logger` interface in `@praxis/core/types` is the **port**. The pino-backed `MainLogger` and the IPC-forwarding `RendererLogger` are **adapters**. Domain code never imports an adapter — it receives a `Logger` via DI (`ServiceDeps.log`, `ToolContext.log`, constructor params).

### Library choice

- **`pino` ^9** — main-process logger. ESM-native, fastest mature option, child-logger and serializer support, redact paths.
- **`pino-roll` ^3** — file rotation transport (size + time based).
- **`pino-pretty` ^11** — dev-only pretty printer; loaded as a transport target.

These are the only new runtime deps. `@opentelemetry/api` is already in `packages/desktop/package.json` (transitively via AI SDK deps) but we don't use it in v1.

---

## Implementation Units

### Unit 1: Logger contract — extend with `child()` and `LogLevel`

**File**: `packages/core/src/types/common.ts`

Modify the existing interface and add a level enum + LogRecord. **Backward-compatible** — all existing call sites continue to work.

```typescript
export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  /**
   * Returns a new Logger whose every record carries `bindings` merged into
   * its `bindings` field. Bindings from the parent are preserved; same-key
   * bindings on the child override the parent.
   *
   * Example: `log.child({ component: "session-service", sessionId })`
   */
  child(bindings: Readonly<Record<string, unknown>>): Logger;
}

/**
 * The shape of a log record as it flows over IPC from renderer → main, and
 * the canonical wire format for any future log transport. Stored fields and
 * bindings stay separate so child-logger context is preserved across hops.
 */
export interface LogRecord {
  level: LogLevel;
  /** Epoch milliseconds. */
  time: number;
  /** Free-form short message. By convention: dotted namespace + verb (e.g., "session.start.ok"). */
  message: string;
  /** Per-call structured fields. */
  fields?: Record<string, unknown>;
  /** Accumulated child-logger bindings (component, sessionId, etc.). */
  bindings?: Record<string, unknown>;
}
```

**Implementation Notes**:
- `LOG_LEVELS` is the **single source of truth** for valid level strings. Both adapters and the IPC envelope validator import it.
- The new `child()` method is required, so every existing concrete Logger implementation must add it. The console-shim in `services.ts` will be removed in Unit 10; tests with hand-rolled noopLogger instances must add `child(): Logger { return this; }`. See test-helper update in Unit 11.
- The Logger interface is a **port** — it lives in `@praxis/core/types`, has zero runtime imports, and is the only Logger import allowed in domain packages.

**Acceptance Criteria**:
- [ ] `LOG_LEVELS` exported as a `readonly` tuple.
- [ ] `LogLevel = (typeof LOG_LEVELS)[number]`.
- [ ] `LogRecord` exported with the exact field shape above.
- [ ] `Logger.child(bindings)` returns a `Logger`.
- [ ] `pnpm typecheck` passes after adding `child()` stubs to every existing concrete Logger (services.ts, scripts, test helpers).

---

### Unit 2: Logging config — `config_kv` schema + reader/writer

**File**: `packages/core/src/config/logging-config.ts` (new)

Apply the **config-kv-store** pattern (see `.claude/skills/patterns/config-kv-store.md`): defaults → stored → env overrides, validated through Zod. Mirror the structure of `engine-config.ts`.

```typescript
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { PraxisDb } from "../db/index.js";
import { configKv } from "../schema.js";
import { LOG_LEVELS, type LogLevel } from "../types/common.js";

export const LOGGING_CONFIG_KEY = "logging";

export const LoggingConfigSchema = z.object({
  /** Minimum level recorded. Records below this level are dropped. */
  level: z.enum(LOG_LEVELS).default("info"),
  /**
   * When true, write JSONL records to `userData/logs/praxis.log` (rotated).
   * Default: false in packaged builds (honors SPEC.md "no telemetry by default"),
   * true in dev (set by buildServices when `app.isPackaged === false`).
   */
  fileEnabled: z.boolean().default(false),
  /**
   * When true, the `prompt`, `messages`, and `modelOutput` fields may appear
   * in logs at debug level. When false (default), those field values are
   * replaced with the literal string "[REDACTED]" before any record is emitted.
   */
  prompts: z.boolean().default(false),
  /** Max single rotated file size in MB. */
  maxFileSizeMb: z.number().int().positive().default(10),
  /** Max number of rotated files retained. Older files are deleted. */
  maxFiles: z.number().int().positive().default(5),
});

export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export const DEFAULT_LOGGING_CONFIG: LoggingConfig = LoggingConfigSchema.parse({});

/**
 * Read the resolved logging config: stored value (if any) merged with defaults,
 * then environment overrides applied.
 *
 * Environment overrides:
 * - PRAXIS_LOG_LEVEL=debug|info|warn|error
 * - PRAXIS_LOG_FILE=1|0   → forces fileEnabled true|false
 * - PRAXIS_LOG_PROMPTS=1  → enables prompt logging at debug
 *
 * The optional `isPackaged` argument flips the `fileEnabled` default for dev:
 * when isPackaged === false and no stored value or env override is set,
 * fileEnabled defaults to true.
 */
export function readLoggingConfig(
  db: PraxisDb,
  opts?: { isPackaged?: boolean },
): LoggingConfig {
  const rows = db.select().from(configKv).where(eq(configKv.key, LOGGING_CONFIG_KEY)).all();
  const stored = rows[0]?.valueJson as Partial<LoggingConfig> | undefined;
  const devDefault = opts?.isPackaged === false ? { fileEnabled: true } : {};
  const merged = LoggingConfigSchema.parse({
    ...DEFAULT_LOGGING_CONFIG,
    ...devDefault,
    ...stored,
  });
  return applyEnvOverrides(merged);
}

export function writeLoggingConfig(db: PraxisDb, config: LoggingConfig): void {
  const validated = LoggingConfigSchema.parse(config);
  db.insert(configKv)
    .values({ key: LOGGING_CONFIG_KEY, valueJson: validated, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: configKv.key,
      set: { valueJson: validated, updatedAt: new Date() },
    })
    .run();
}

function applyEnvOverrides(base: LoggingConfig): LoggingConfig {
  const env = process.env;
  const cand: LoggingConfig = { ...base };
  if (env.PRAXIS_LOG_LEVEL) {
    cand.level = LoggingConfigSchema.shape.level.parse(env.PRAXIS_LOG_LEVEL) as LogLevel;
  }
  if (env.PRAXIS_LOG_FILE === "1") cand.fileEnabled = true;
  if (env.PRAXIS_LOG_FILE === "0") cand.fileEnabled = false;
  if (env.PRAXIS_LOG_PROMPTS === "1") cand.prompts = true;
  return cand;
}
```

Re-export from `packages/core/src/config/index.ts`:

```typescript
export {
  DEFAULT_LOGGING_CONFIG,
  LOGGING_CONFIG_KEY,
  type LoggingConfig,
  LoggingConfigSchema,
  readLoggingConfig,
  writeLoggingConfig,
} from "./logging-config.js";
```

**Implementation Notes**:
- The dev-vs-packaged split is computed at the read site (we don't store `app.isPackaged` in the DB). Caller (`buildServices`) passes `isPackaged: app.isPackaged`.
- Validation throws on malformed stored data — matches `engine-config.ts` policy.

**Acceptance Criteria**:
- [ ] `LoggingConfigSchema` validates and rejects unknown levels, negative sizes.
- [ ] Stored partial values merge correctly: storing `{ level: "debug" }` keeps other defaults.
- [ ] Env overrides win over stored values.
- [ ] `isPackaged: false` flips `fileEnabled` default to true unless overridden.
- [ ] Tests in `packages/core/src/config/__tests__/logging-config.test.ts` cover defaults, overrides, env, and validation errors.

---

### Unit 3: Main-process Logger adapter — `MainLogger` (pino)

**File**: `packages/desktop/electron/main/logger.ts` (new)

The pino-backed concrete `Logger` for the main process. Owns the pino instance, the file rotation transport, redaction, prompt-gating, child-logger composition, and the renderer ingestion entry point.

```typescript
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import pino, { type DestinationStream, type Logger as PinoInstance } from "pino";
import type { Logger, LogLevel, LogRecord } from "@praxis/core/types";

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

  return wrap(root, opts.prompts);
}

function wrap(pinoInstance: PinoInstance, allowPrompts: boolean): MainLogger {
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
    info:  (msg, fields) => pinoInstance.info (guard(fields) ?? {}, msg),
    warn:  (msg, fields) => pinoInstance.warn (guard(fields) ?? {}, msg),
    error: (msg, fields) => pinoInstance.error(guard(fields) ?? {}, msg),
    child: (bindings) => wrap(pinoInstance.child(bindings), allowPrompts),
    ingestRendererRecord: (record) => {
      const merged = { ...(record.bindings ?? {}), source: "renderer" as const };
      const child = pinoInstance.child(merged);
      const fields = guard(record.fields);
      child[record.level](fields ?? {}, record.message);
    },
    shutdown: async () => {
      await new Promise<void>((resolve) => pinoInstance.flush(() => resolve()));
    },
  };
  return wrapped;
}
```

**Implementation Notes**:
- `pino.transport({ targets })` runs the transports on a worker thread — record emission is non-blocking.
- The `child()` method returns a fresh `MainLogger` wrapped around `pinoInstance.child()`. `ingestRendererRecord` is intentionally only on the root MainLogger; child loggers inherit it via the same closure (it captures `pinoInstance` correctly per-wrap call, so children have their own correct ingestor — tests must verify that ingesting on a child carries child bindings + record bindings).
- Redaction paths use pino's built-in `redact` API (string-path matching). Prompt-content gating is a separate, value-level transform because pino's `redact` doesn't censor by field-content type.
- `formatters.level` ensures the on-disk JSON has `"level": "info"` rather than pino's default numeric levels — easier to grep.
- `baseBindings` is intended for `{ pid: process.pid, version: app.getVersion() }`.

**Acceptance Criteria**:
- [ ] When `filePath` is set, the file is created (directory auto-mkdir).
- [ ] When `pretty: true`, stdout shows colorized human-readable output; when false, stdout is JSONL.
- [ ] `child({ a: 1 }).child({ b: 2 }).info("x")` emits a record with bindings `{ a: 1, b: 2 }`.
- [ ] Field `apiKey: "secret"` becomes `apiKey: "[REDACTED]"` in the output (per pino redact paths).
- [ ] When `prompts: false`, `prompt`, `messages`, `modelOutput`, `systemPrompt` fields are replaced with `"[REDACTED]"`.
- [ ] When `prompts: true`, those fields pass through unchanged.
- [ ] `ingestRendererRecord({ level: "warn", message: "x", time: T, bindings: { component: "ui" } })` emits a warn record with `source: "renderer"` AND `component: "ui"`.
- [ ] `shutdown()` resolves after pino flush.
- [ ] Unit tests in `packages/desktop/electron/main/__tests__/logger.test.ts` use a memory destination (`pino.destination({ sync: true, dest: <writable buffer> })`) to assert record shape.

---

### Unit 4: IPC log channel — renderer → main forwarding

**File**: `packages/desktop/electron/main/log-channel.ts` (new)

```typescript
import { ipcMain } from "electron";
import { LOG_LEVELS, type LogLevel, type LogRecord } from "@praxis/core/types";
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
```

**Implementation Notes**:
- Channel name follows the `praxis.{domain}.{action}` IPC convention from `.claude/skills/patterns/ipc-channel-convention.md`. This is a fire-and-forget signal (`ipcMain.on` not `ipcMain.handle`), which matches the pattern's guidance for "fire-and-forget signals like cancel".
- Validation is intentionally permissive: `fields` and `bindings` are accepted as any object. We don't deep-validate user-supplied fields — that would add cost on the hot path.

**Acceptance Criteria**:
- [ ] `LOG_CHANNEL` exported as `"praxis.log.record"`.
- [ ] Malformed records (missing level, wrong type) are dropped without throwing.
- [ ] Valid records reach `MainLogger.ingestRendererRecord`.
- [ ] Test in `packages/desktop/electron/main/__tests__/log-channel.test.ts` mocks `ipcMain.on` and asserts both paths.

---

### Unit 5: Renderer-process Logger adapter — `RendererLogger`

**File**: `packages/client/src/logger/renderer-logger.ts` (new)

Lives in `@praxis/client` because that package already owns the IPC bridge. The renderer logger is a `Logger` that builds `LogRecord` envelopes and ships them via `bridge.send(LOG_CHANNEL, record)`.

```typescript
import type { Logger, LogLevel, LogRecord } from "@praxis/core/types";
import type { PraxisIpcBridge } from "../transport/ipc.js";

/** Mirrors LOG_CHANNEL in @praxis/desktop/main/log-channel.ts. */
const LOG_CHANNEL = "praxis.log.record";

export interface RendererLoggerOptions {
  /** The contextBridge-exposed praxis bridge; e.g., `window.praxis`. */
  bridge: PraxisIpcBridge;
  /**
   * Initial bindings (e.g., `{ component: "renderer" }`). Every record carries
   * these merged with bindings from any `.child()` ancestry.
   */
  initialBindings?: Record<string, unknown>;
  /**
   * Also call `console[level](message, fields)` per emit. Default: true.
   * Set false for production renderer where DevTools is unavailable and the
   * console output is noise.
   */
  echoConsole?: boolean;
}

export function createRendererLogger(opts: RendererLoggerOptions): Logger {
  return makeLogger(opts.bridge, opts.initialBindings ?? {}, opts.echoConsole ?? true);
}

function makeLogger(
  bridge: PraxisIpcBridge,
  bindings: Record<string, unknown>,
  echoConsole: boolean,
): Logger {
  const emit = (level: LogLevel, message: string, fields?: Record<string, unknown>): void => {
    const record: LogRecord = {
      level,
      time: Date.now(),
      message,
      ...(fields !== undefined && { fields }),
      ...(Object.keys(bindings).length > 0 && { bindings }),
    };
    try {
      bridge.send(LOG_CHANNEL, record);
    } catch {
      // Bridge unavailable (e.g., bridge crashed). Fall back to console.
      // Don't throw — logging must never break the caller.
    }
    if (echoConsole) {
      const args: unknown[] = fields !== undefined ? [message, fields] : [message];
      // biome-ignore lint/suspicious/noConsole: dev echo only
      console[level](...args);
    }
  };

  return {
    debug: (m, f) => emit("debug", m, f),
    info:  (m, f) => emit("info",  m, f),
    warn:  (m, f) => emit("warn",  m, f),
    error: (m, f) => emit("error", m, f),
    child: (childBindings) =>
      makeLogger(bridge, { ...bindings, ...childBindings }, echoConsole),
  };
}
```

Re-export from `packages/client/src/index.ts`:

```typescript
export { createRendererLogger, type RendererLoggerOptions } from "./logger/renderer-logger.js";
```

**Implementation Notes**:
- `bridge.send` is fire-and-forget (preload's `ipcRenderer.send` does not return a Promise). No await, no error path — perfect for hot-path logging.
- The `try/catch` around `bridge.send` is defensive: if the bridge throws (extremely unlikely; only happens if contextBridge tears down), we don't crash the renderer.
- `child()` returns a brand-new `Logger` closure with merged bindings. Bindings are shallow-merged — don't try to deep-merge nested objects.

**Acceptance Criteria**:
- [ ] `createRendererLogger({ bridge, initialBindings: { component: "renderer" } })` returns a `Logger`.
- [ ] Calling `.info("x", { y: 1 })` invokes `bridge.send("praxis.log.record", { level: "info", time: <ms>, message: "x", fields: { y: 1 }, bindings: { component: "renderer" } })`.
- [ ] `.child({ sessionId: "s1" }).warn("y")` produces a record with `bindings: { component: "renderer", sessionId: "s1" }`.
- [ ] Logging never throws even when `bridge.send` throws.
- [ ] Tests in `packages/client/src/__tests__/renderer-logger.test.ts` use a fake bridge that captures `send` calls.

---

### Unit 6: Renderer global error handlers + React `ErrorBoundary`

**File 1**: `packages/desktop/electron/renderer/index.tsx` (modify existing)

At the top of the renderer entry, before React mounts, wire global handlers and the renderer logger into a context that components can read.

```typescript
import { createRendererLogger } from "@praxis/client";
import type { PraxisIpcBridge } from "@praxis/client";

declare global {
  interface Window { praxis: PraxisIpcBridge }
}

const log = createRendererLogger({
  bridge: window.praxis,
  initialBindings: { component: "renderer" },
});

window.addEventListener("error", (event) => {
  log.error("renderer.uncaught_error", {
    err: { message: event.message, stack: event.error instanceof Error ? event.error.stack : undefined },
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  log.error("renderer.unhandled_rejection", {
    err: {
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    },
  });
});

// existing ReactDOM.createRoot(...).render(<App log={log} />)
```

The `log` instance is passed into the existing React tree (see file 2 for the boundary).

**File 2**: `packages/ui/src/components/error-boundary.tsx` (new)

```typescript
import type { Logger } from "@praxis/core/types";
import { Component, type ErrorInfo, type ReactNode } from "react";

export interface ErrorBoundaryProps {
  log: Logger;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.log.error("renderer.error_boundary", {
      err: { message: error.message, stack: error.stack },
      componentStack: info.componentStack,
    });
  }

  reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    if (this.state.error) {
      return (
        this.props.fallback?.(this.state.error, this.reset) ?? (
          <div role="alert" style={{ padding: 16 }}>
            <h2>Something went wrong</h2>
            <pre style={{ whiteSpace: "pre-wrap", overflow: "auto" }}>
              {this.state.error.message}
            </pre>
            <button onClick={this.reset}>Reset</button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
```

Wrap the top-level App in this boundary in `renderer/index.tsx`:

```typescript
root.render(
  <ErrorBoundary log={log}>
    <App />
  </ErrorBoundary>,
);
```

**Implementation Notes**:
- `ErrorBoundary` is a class component because React requires `componentDidCatch` for error boundaries — there is no hooks equivalent. This is the only class component the codebase needs.
- The `log` prop is required so the boundary can be unit-tested with a mock logger.
- `componentStack` from `ErrorInfo` is invaluable — it pinpoints which subtree threw.

**Acceptance Criteria**:
- [ ] Throwing an Error from a child component calls `log.error("renderer.error_boundary", ...)` once.
- [ ] The fallback UI renders with the error message.
- [ ] The reset button clears the error state and re-renders children.
- [ ] `window.dispatchEvent(new ErrorEvent("error", {...}))` triggers a `renderer.uncaught_error` log record.
- [ ] An unhandled promise rejection triggers a `renderer.unhandled_rejection` record.
- [ ] Tests in `packages/ui/src/__tests__/error-boundary.test.tsx` use a fake Logger and a deliberately throwing child.

---

### Unit 7: IPC handler error wrapper + slow-call instrumentation

**File**: `packages/desktop/electron/main/ipc-helpers.ts` (new)

The single biggest observability gap today is that ~30 non-streamed `ipcMain.handle` calls in `ipc-server.ts` have no `try/catch`. They throw, the renderer gets a rejection, and nothing is logged. This unit ships a wrapper used by every `handle()` call.

```typescript
import type { IpcMainInvokeEvent } from "electron";
import { ipcMain } from "electron";
import type { Logger } from "@praxis/core/types";

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
    fn: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown | Promise<unknown>,
  ) => void;
  /**
   * Register an `ipcMain.on` channel (fire-and-forget). Errors from the handler
   * are logged but never re-thrown (ipcMain.on has no rejection path).
   */
  on: (
    channel: string,
    fn: (event: Electron.IpcMainEvent, ...args: unknown[]) => unknown | Promise<unknown>,
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
          channelLog.error("ipc.handle.error", { durationMs, err: serializeError(err) });
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
          channelLog.error("ipc.on.error", { err: serializeError(err) });
        }
      });
    },
  };
}

/**
 * Convert an arbitrary thrown value into a structured field. Handles Error,
 * EngineError-shaped objects (with `code`), strings, and unknown.
 */
export function serializeError(err: unknown): {
  message: string;
  stack?: string;
  code?: string;
  name?: string;
} {
  if (err instanceof Error) {
    return {
      message: err.message,
      ...(err.stack !== undefined && { stack: err.stack }),
      ...(err.name !== undefined && { name: err.name }),
      ...("code" in err && typeof err.code === "string" && { code: err.code }),
    };
  }
  if (err && typeof err === "object" && "message" in err) {
    const e = err as { message: unknown; code?: unknown };
    return {
      message: String(e.message),
      ...(typeof e.code === "string" && { code: e.code }),
    };
  }
  return { message: String(err) };
}
```

**Modify** `packages/desktop/electron/main/ipc-server.ts`: at the top of `registerIpcHandlers`, replace the existing local `handle` helper with the wrapper:

```typescript
export function registerIpcHandlers(
  services: Services,
  webContentsGetter: () => Electron.WebContents | null,
  log: Logger,                             // ← NEW PARAM
): () => void {
  const { handle, on } = createIpcHelpers(log);
  // ... existing code uses handle(channel, fn) unchanged.
  // The two existing ipcMain.on calls (cancel) become on(channel, fn).
}
```

The streaming handlers (`praxis.session.send.start`, `praxis.ingest.start`, `praxis.memory.episodic.start`, `praxis.auth.claude.login.start`) get a parallel `streamId`-scoped child logger inside the handler body:

```typescript
handle("praxis.session.send.start", async (_event, streamId: string, sessionId: string, message: string) => {
  const streamLog = log.child({ component: "session.send", streamId, sessionId });
  const controller = new AbortController();
  activeAbortControllers.set(streamId, controller);
  const eventsChannel = `praxis.session.send.events.${streamId}`;
  const t0 = performance.now();
  let eventCount = 0;
  let errorCount = 0;

  const push = (msg: IpcStreamMessage<unknown>) => {
    const wc = webContentsGetter();
    if (!wc || wc.isDestroyed()) return;
    wc.send(eventsChannel, msg);
  };

  streamLog.info("session.send.start", { messageLength: message.length });
  try {
    const stream = services.session.send(sessionId as SessionId, message);
    for await (const event of stream) {
      if (controller.signal.aborted) break;
      eventCount++;
      if (event.type === "error") errorCount++;
      push({ kind: "event", payload: event });
    }
    push({ kind: "done" });
    streamLog.info("session.send.done", {
      durationMs: Math.round(performance.now() - t0),
      eventCount,
      errorCount,
    });
  } catch (err) {
    streamLog.error("session.send.error", {
      durationMs: Math.round(performance.now() - t0),
      eventCount,
      err: serializeError(err),
    });
    push({ kind: "error", error: err instanceof Error ? err.message : String(err) });
  } finally {
    activeAbortControllers.delete(streamId);
  }
});
```

The same shape applies to `ingest-channel.ts` (already lives in its own file), `praxis.memory.episodic.start`, and `praxis.auth.claude.login.start`.

**Implementation Notes**:
- The `serializeError` helper is exported because session/engine instrumentation in Unit 8 also uses it.
- `performance.now()` rather than `Date.now()` — sub-ms resolution, monotonic.
- The `200ms` slow-call threshold is a starting point; not configurable in v1.
- Stream IPC handlers stay manually written (not a generic wrapper) because their lifecycle is different from request/response handlers. The `streamLog.info("…start") → log per event-type → log("…done") | log.error("…error")` pattern is what the implementer follows.

**Acceptance Criteria**:
- [ ] All 30+ existing `handle(...)` registrations in `ipc-server.ts` continue to work via the wrapper (no signature changes for callers).
- [ ] When a handler throws, the renderer still receives an IPC rejection AND `log.error("ipc.handle.error", {...})` is called once.
- [ ] When a handler completes in <200ms, only a debug record is emitted; >200ms emits an info `ipc.handle.slow` record.
- [ ] All four streaming handlers emit `info` start, `info` done with `durationMs` + `eventCount`, or `error` with `durationMs`.
- [ ] The two existing `ipcMain.on` listeners (cancel channels for session.send and ingest) are migrated to `on()`.
- [ ] Test in `packages/desktop/electron/main/__tests__/ipc-helpers.test.ts` covers ok / slow / error / on-error paths with mock ipcMain.

---

### Unit 8: Session, engine, and tool-dispatch instrumentation

The silent error-swallowing sites are the second biggest gap. Each one gets a `log.warn` or `log.error` call, never silently swallowed.

#### 8a. `packages/core/src/services/session-service.ts`

Sites to change (line numbers may have drifted; locate by code):

- **Line ~145** (engine swap close): `entry.handle.close().catch(() => {})` → `entry.handle.close().catch((err) => this.deps.log.warn("session.engine_swap.close_failed", { sessionId, oldEngineId, err: serializeError(err) }))`.
- **Line ~220** (session end): same pattern.
- **Line ~359** (batch close on shutdown): same pattern, with `this.deps.log.warn("session.shutdown.close_failed", ...)`.

Also, `SessionServiceImpl.send()` should bind a child logger early in its async generator and use it through the turn:

```typescript
async *send(sessionId: SessionId, message: string): AsyncIterable<EngineEvent> {
  const turnLog = this.deps.log.child({
    component: "session-service",
    sessionId,
    turnIndex: nextTurnIndex(this.deps.db, sessionId),
  });
  turnLog.debug("turn.start", { messageLength: message.length });
  // ... existing logic ...
  // On terminal error: turnLog.error("turn.error", { err: serializeError(err) });
  // On done: turnLog.debug("turn.done", { eventCount, durationMs });
}
```

`serializeError` is imported from a new shared location. Since it's needed in core (which can't depend on desktop), create:

**File**: `packages/core/src/types/errors.ts` (new)

```typescript
/**
 * Convert an arbitrary thrown value into a structured field for logging.
 * Lives in core/types so domain code can format errors consistently without
 * importing from desktop.
 */
export interface SerializedError {
  message: string;
  stack?: string;
  code?: string;
  name?: string;
}

export function serializeError(err: unknown): SerializedError {
  if (err instanceof Error) {
    return {
      message: err.message,
      ...(err.stack !== undefined && { stack: err.stack }),
      ...(err.name !== undefined && { name: err.name }),
      ...("code" in err && typeof err.code === "string" && { code: err.code }),
    };
  }
  if (err && typeof err === "object" && "message" in err) {
    const e = err as { message: unknown; code?: unknown };
    return {
      message: String(e.message),
      ...(typeof e.code === "string" && { code: e.code }),
    };
  }
  return { message: String(err) };
}
```

Re-export from `packages/core/src/types/index.ts`. The Unit 7 `ipc-helpers.ts` imports it instead of re-defining it.

#### 8b. `packages/engines/src/claude-code/adapter.ts`

Lines ~157-158: `toolBridge.close().catch(() => {})` and `conversation.close().catch(() => {})` → log via the engine's deps.log:

```typescript
toolBridge.close().catch((err) => log.warn("engine.claude-code.tool_bridge_close_failed", { err: serializeError(err) }));
conversation.close().catch((err) => log.warn("engine.claude-code.conversation_close_failed", { err: serializeError(err) }));
```

The engine factory in `packages/engines/src/index.ts` already accepts `deps: { log: Logger }` (used in `services.ts:145, 156, 195, 234`). Adapters use it via constructor injection. No new plumbing required.

Apply the same pattern in:
- `packages/engines/src/codex/adapter.ts` — any close-swallow paths.
- `packages/engines/src/direct/adapter.ts` — same.

#### 8c. `packages/tools/src/registry.ts` — InProcessToolRegistry.dispatch()

Add a `log.debug("tool.dispatch.start", { name })` at the top of dispatch, `log.debug("tool.dispatch.ok", { name, durationMs })` on success, `log.warn("tool.dispatch.error", { name, durationMs, err })` on caught exceptions. The registry takes a logger via constructor (existing `ToolContext.log` flows through differently — check the current shape; if registry has no logger, add one through `InProcessToolRegistry` constructor).

**Implementation Notes**:
- These migrations are localized — each file gets a few `log.warn` / `log.error` calls in places where errors currently disappear. No behavior change beyond observability.
- The single `serializeError` SSOT is in `@praxis/core/types/errors.ts`.

**Acceptance Criteria**:
- [ ] Every `.catch(() => {})` in `session-service.ts` is replaced with `.catch((err) => log.warn(...))`.
- [ ] Same in `engines/src/*/adapter.ts` close paths.
- [ ] `SessionServiceImpl.send` binds a child logger with `{ sessionId, turnIndex }` and emits start/done/error.
- [ ] Tool registry logs every dispatch outcome.
- [ ] Existing tests pass (using updated noopLogger in test helpers — see Unit 11).
- [ ] `serializeError` exported from `@praxis/core/types/index.ts`.

---

### Unit 9: Bootstrap migration — replace bare `console.*`

#### 9a. `packages/desktop/electron/main/index.ts` (modify existing)

Current state: 9 bare `console.{log,warn,error}` calls (lines 12-41). Replace with the new logger.

```typescript
import { app } from "electron";
import { createMainLogger } from "./logger.js";
import { registerLogChannel } from "./log-channel.js";
import { registerIpcHandlers } from "./ipc-server.js";
import { applyMigrations, resolveDbPath } from "./migrations.js";
import { buildServices, type Services } from "./services.js";
import { createMainWindow } from "./window.js";
import { readLoggingConfig } from "@praxis/core/config";
import { openDb } from "@praxis/core/db";
import { join } from "node:path";

let services: Services | null = null;
let mainWindow: Electron.BrowserWindow | null = null;
let log: Awaited<ReturnType<typeof createBootstrapLogger>>;

async function createBootstrapLogger(dbPath: string) {
  const { db } = openDb({ path: dbPath });
  const cfg = readLoggingConfig(db, { isPackaged: app.isPackaged });
  return createMainLogger({
    level: cfg.level,
    pretty: !app.isPackaged,
    prompts: cfg.prompts,
    maxFileSizeMb: cfg.maxFileSizeMb,
    maxFiles: cfg.maxFiles,
    ...(cfg.fileEnabled && {
      filePath: join(app.getPath("userData"), "logs", "praxis.log"),
    }),
    baseBindings: { pid: process.pid, version: app.getVersion() },
  });
}

async function bootstrap(): Promise<void> {
  const dbPath = resolveDbPath();
  log = await createBootstrapLogger(dbPath);
  const bootLog = log.child({ component: "bootstrap" });

  bootLog.info("bootstrap.start", { dbPath });
  await applyMigrations(dbPath);
  bootLog.info("bootstrap.migrations_applied");

  services = buildServices(dbPath, log);  // ← NEW: pass logger explicitly
  bootLog.info("bootstrap.services_built");

  services.pyodide.preload().catch((err) => {
    bootLog.warn("bootstrap.pyodide_preload_failed", { err: serializeError(err) });
  });
  services.embeddings.preload().catch((err) => {
    bootLog.warn("bootstrap.embeddings_preload_failed", { err: serializeError(err) });
  });

  mainWindow = createMainWindow();
  registerLogChannel(log);  // ← NEW: forward renderer logs into the same sink
  registerIpcHandlers(services, () => mainWindow?.webContents ?? null, log);  // ← log param

  mainWindow.on("closed", () => { mainWindow = null; });
  bootLog.info("bootstrap.done");
}

app.whenReady().then(async () => {
  await bootstrap().catch((err) => {
    // log may not be initialized; fall back to console for this one error
    if (log) {
      log.error("bootstrap.failed", { err: serializeError(err) });
    } else {
      // biome-ignore lint/suspicious/noConsole: pre-logger fallback
      console.error("Praxis bootstrap failed:", err);
    }
    app.exit(1);
  });
  app.on("activate", () => {
    if (mainWindow === null) mainWindow = createMainWindow();
  });
});

app.on("before-quit", async (event) => {
  if (!services) return;
  event.preventDefault();
  try {
    await services.session.shutdown();
  } finally {
    await log?.shutdown();
    app.exit(0);
  }
});
```

#### 9b. `packages/desktop/electron/main/services.ts` (modify existing)

Replace the inline `log` shim (lines 103-108) with the injected logger:

```typescript
export function buildServices(dbPath: string, log: MainLogger): Services {
  const { db, sqlite } = openDb({ path: dbPath });
  // ... rest unchanged. Every `log` reference uses the parameter.
}
```

Update the `Services` type's surrounding code to reflect the new signature. Composition-root code (`index.ts`) is the only caller.

**Implementation Notes**:
- The bootstrap logger is created **before** any service. The very first DB open happens inside `createBootstrapLogger` (to read `LoggingConfig`); it's then shared with `buildServices` which calls `openDb` again (better-sqlite3 returns a fresh handle per call — this is fine; no cross-handle state).
- If config-read fails (e.g., DB corrupted), we fall back to default config so logging at least works during the recovery path.

**Acceptance Criteria**:
- [ ] `index.ts` contains zero `console.*` calls except the pre-logger fallback in the bootstrap-failure path.
- [ ] `services.ts` no longer defines an inline `log` shim; uses the injected `MainLogger`.
- [ ] Bootstrap log records include `component: "bootstrap"`, `pid`, `version`.
- [ ] `before-quit` handler calls `log.shutdown()`.

---

### Unit 10: Test helpers — `noopLogger()` update

**File**: `packages/core/src/types/__tests__/test-utils.ts` or wherever `noopLogger` is currently defined; if it doesn't exist as a shared helper, create at `tests/helpers/logger.ts`.

```typescript
import type { Logger } from "@praxis/core/types";

/**
 * No-op Logger for tests. All methods do nothing. `.child()` returns the same
 * instance so binding chains don't break.
 */
export function noopLogger(): Logger {
  const instance: Logger = {
    debug: () => {},
    info:  () => {},
    warn:  () => {},
    error: () => {},
    child: () => instance,
  };
  return instance;
}

/**
 * Recording Logger for tests that want to assert on emitted records.
 */
export function recordingLogger(): Logger & { records: Array<{ level: string; message: string; fields?: Record<string, unknown>; bindings?: Record<string, unknown> }> } {
  const records: Array<{ level: string; message: string; fields?: Record<string, unknown>; bindings?: Record<string, unknown> }> = [];
  const make = (bindings: Record<string, unknown>): Logger => ({
    debug: (m, f) => records.push({ level: "debug", message: m, ...(f && { fields: f }), ...(Object.keys(bindings).length && { bindings }) }),
    info:  (m, f) => records.push({ level: "info",  message: m, ...(f && { fields: f }), ...(Object.keys(bindings).length && { bindings }) }),
    warn:  (m, f) => records.push({ level: "warn",  message: m, ...(f && { fields: f }), ...(Object.keys(bindings).length && { bindings }) }),
    error: (m, f) => records.push({ level: "error", message: m, ...(f && { fields: f }), ...(Object.keys(bindings).length && { bindings }) }),
    child: (b) => make({ ...bindings, ...b }),
  });
  return Object.assign(make({}), { records });
}
```

Search the repo (`grep -rn "noopLogger\|: Logger = {" tests packages`) and update every inline test logger to either use the shared helper or add `child: (): Logger => this` (or equivalent).

**Acceptance Criteria**:
- [ ] Shared `noopLogger()` and `recordingLogger()` helpers exist.
- [ ] All tests that previously inlined a Logger are updated.
- [ ] `pnpm test` passes across all packages.

---

### Unit 11: Documentation

**File**: `docs/OBSERVABILITY.md` (new)

Single page covering the observability story so future agents and contributors know the conventions.

Sections:

1. **Architecture overview** — port (Logger) + adapters (MainLogger, RendererLogger), one IPC channel.
2. **Levels** — when to use debug / info / warn / error.
3. **Message naming convention** — `dotted.namespace.verb` (e.g., `session.start.ok`, `ipc.handle.error`, `ingestion.parse_failed`). Lowercase, no spaces, snake_case for tokens within a segment.
4. **Well-known fields** (the SSOT for context names — non-enforced but documented):
   - `component` — top-level subsystem (`bootstrap`, `ipc`, `session-service`, `engine.claude-code`, `ingestion`, `tool-dispatch`, `renderer`, `renderer.error-boundary`).
   - `sessionId`, `streamId`, `turnIndex` — correlation across IPC streams and engine turns.
   - `engineId`, `modeId` — runtime selection.
   - `channel` — IPC channel name (auto-bound by `createIpcHelpers`).
   - `durationMs` — number; whole milliseconds, rounded.
   - `err` — always pass through `serializeError(err)`; produces `{ message, stack?, code?, name? }`.
   - `eventCount`, `errorCount` — for stream summaries.
5. **Redaction**:
   - Path-redacted fields: `apiKey`, `authorization`, `password`, `lockCode` (and same as nested `*.apiKey`, etc.).
   - Prompt-content fields gated by `PRAXIS_LOG_PROMPTS=1`: `prompt`, `messages`, `modelOutput`, `systemPrompt`.
6. **Configuration**:
   - `config_kv` key `logging` holds `LoggingConfig`.
   - Env vars: `PRAXIS_LOG_LEVEL`, `PRAXIS_LOG_FILE=1|0`, `PRAXIS_LOG_PROMPTS=1`.
   - File path: `<userData>/logs/praxis.log` (rotated via pino-roll).
   - Defaults: dev → file on, prod → file off, level info, prompts off.
7. **Renderer logging** — every renderer Logger eventually lands in main's pino. React errors caught by `ErrorBoundary` and global handlers (window.onerror, unhandledrejection) flow through the same channel.
8. **Adding a new component** — pick a stable component name, document it in this file, use `log.child({ component: "..." })` at construction time. Don't invent components per-record.
9. **Future seams** (explicitly **not** v1):
   - OpenTelemetry spans replacing child-logger correlation.
   - LangSmith / Helicone exporters at the engine adapter layer.
   - Hosted log shipping (v2 Postgres + WS deployment).

**Acceptance Criteria**:
- [ ] `docs/OBSERVABILITY.md` exists with the sections above.
- [ ] Cross-referenced from `docs/ARCHITECTURE.md` (the existing observability bullet at line 396).

---

## Implementation Order

Resolve dependencies — earlier units must exist before later units can be built.

1. **Unit 1** (Logger contract + LogRecord + LOG_LEVELS) — depended on by every other unit.
2. **Unit 2** (LoggingConfig in `@praxis/core/config`) — required by MainLogger creation.
3. **Unit 8a** (`serializeError` in `@praxis/core/types/errors.ts`) — required by ipc-helpers and session/engine instrumentation. Build this part of Unit 8 first; the actual call-site migrations can wait until later in the order.
4. **Unit 3** (MainLogger pino adapter) — needs Unit 1, 2.
5. **Unit 4** (IPC log channel) — needs Unit 1, 3.
6. **Unit 5** (RendererLogger in `@praxis/client`) — needs Unit 1.
7. **Unit 7** (IPC helpers `handle` / `on` wrapper) — needs Unit 1, 8a; modifies ipc-server.ts.
8. **Unit 9** (Bootstrap migration: index.ts + services.ts) — needs Units 1-7.
9. **Unit 6** (Renderer ErrorBoundary + global handlers) — needs Unit 5; can be built in parallel with Unit 8 once Unit 5 is done.
10. **Unit 8b/8c** (call-site migrations in session/engine/tools) — needs Units 1, 8a; can run in parallel with Units 6 and 9.
11. **Unit 10** (Test helper updates + global test fix-up) — last; after all production code lands.
12. **Unit 11** (Documentation) — last; after final shape is set.

---

## Testing

### Unit Tests

| File | Coverage |
|---|---|
| `packages/core/src/config/__tests__/logging-config.test.ts` | Schema defaults, stored-value merge, env overrides, isPackaged behavior, validation errors. |
| `packages/desktop/electron/main/__tests__/logger.test.ts` | Pretty vs JSONL output, file creation/rotation (use small `maxFileSizeMb`), redact paths, prompt gating, child binding inheritance, ingestRendererRecord, shutdown flush. |
| `packages/desktop/electron/main/__tests__/log-channel.test.ts` | Mock ipcMain.on; valid record reaches ingest, malformed dropped, no throw on bad payload. |
| `packages/desktop/electron/main/__tests__/ipc-helpers.test.ts` | handle: ok/slow/error paths emit correct records, errors re-thrown. on: errors caught, never re-thrown. |
| `packages/client/src/__tests__/renderer-logger.test.ts` | Records shape, child bindings merge, console echo on/off, bridge.send failure swallowed. |
| `packages/ui/src/__tests__/error-boundary.test.tsx` | Throws → fallback rendered → log.error called once with componentStack; reset clears error. |
| `packages/core/src/types/__tests__/errors.test.ts` | serializeError on Error, EngineError-shaped, plain string, null, undefined, circular object. |

### Integration Tests

| File | Coverage |
|---|---|
| `tests/observability-end-to-end.test.ts` | Full bootstrap → MainLogger created → register channel → ingest a synthetic renderer record → assert it reaches a captured pino destination. Use temp-db helper from `tests/helpers/db-setup.ts`. |
| `tests/ipc-error-logging.test.ts` | Register a deliberately-throwing IPC handler via `createIpcHelpers`; invoke it; assert `ipc.handle.error` is recorded with channel + durationMs + err. |

### Manual Verification

After implementation:

```bash
# 1. Dev mode: pretty stdout, file enabled by default
pnpm dev
# → Should see colorized "[bootstrap] bootstrap.start ..." lines
# → Should see ~/.config/@praxis/desktop/logs/praxis.log appear

# 2. Trigger renderer error: open the dev app, paste this into DevTools console:
throw new Error("test renderer crash");
# → Should appear in main process stdout AND in praxis.log with component: "renderer"

# 3. Trigger React error: temporarily make a component throw on render
# → ErrorBoundary fallback shows; record with componentStack in praxis.log

# 4. Trigger IPC error: invoke an IPC handler with a bad arg
window.praxis.invoke("praxis.session.start", { modeId: "nonexistent-mode" }).catch(console.error)
# → Renderer console: rejection
# → Main log: error record with channel="praxis.session.start", durationMs, err.message

# 5. PDF ingest (the original motivating case): ingest a PDF
# → Logs include ingestion.parsing.start, ingestion.parsing.ok or parse_failed,
#   indexing batches, with sessionId? no — with documentId.

# 6. Verify redaction
PRAXIS_LOG_LEVEL=debug pnpm dev
# Set engine config with apiKey "secret-test"
# → "secret-test" should NOT appear anywhere in praxis.log; "[REDACTED]" should.

# 7. Verify prompt gating
# → Without PRAXIS_LOG_PROMPTS=1: any "prompt"/"messages" field shows "[REDACTED]"
# → With PRAXIS_LOG_PROMPTS=1: full prompt content visible at debug level
```

---

## Verification Checklist

```bash
# Code quality
pnpm typecheck                      # All packages
pnpm exec biome check .             # Lint clean
pnpm test                           # All package tests pass

# Coverage check: no bare console.* in production source
grep -rn "console\\.\\(log\\|debug\\|info\\|warn\\|error\\)" \\
  packages/{core,client,ui,desktop,engines,tools,curriculum,memory,artifacts}/src \\
  | grep -v __tests__ | grep -v noConsole
# → Expected: empty (only noConsole-suppressed lines remain, e.g., the pre-logger
#   bootstrap fallback in index.ts and the dev-echo in renderer-logger).

# Coverage check: no silent error swallowing
grep -rn "\\.catch(() => {})\\|catch {}\\|catch (.*) {}" \\
  packages/{core,engines,tools,curriculum,memory,artifacts}/src \\
  | grep -v __tests__
# → Expected: empty (every catch has a logger call).
```

---

## Out of scope (acknowledged future work)

- **Hosted/v2 log shipping**: when v2 ships a Node service, `MainLogger` becomes `ServerLogger` with the same shape but different transports (e.g., stdout JSONL → Loki / CloudWatch). The Logger port stays unchanged.
- **OpenTelemetry**: `@opentelemetry/api` is already a transitive dep; future units could add `tracer.startSpan()` around `SessionServiceImpl.send` and IPC handlers, with span IDs added to log records as `traceId` / `spanId` bindings.
- **Engine-adapter exporters**: Helicone / LangSmith hooks at the engine adapter layer (per `docs/ARCHITECTURE.md:396`) for hosted deployments.
- **CLI script migration**: `scripts/*.ts` keep their console output — they're stand-alone utilities run interactively.
- **Per-component log-level config**: v1 has a single global level. A future config like `{ level: "info", overrides: { "engine.claude-code": "debug" } }` is a clean extension that fits the existing schema.
- **Sampling / rate limiting**: hot-path streams (e.g., model_message partials) are intentionally not logged today. If the noise floor changes, pino's child-rate-limiter or a simple dropping wrapper is a small follow-up.
