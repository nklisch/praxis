/**
 * Branded primitive for nominal typing of IDs and other domain primitives.
 * Use the helpers in `ids.ts` to construct branded values.
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type Timestamp = Brand<number, "Timestamp">; // milliseconds since epoch

export interface Citation {
  source: string; // free-form: textbook section ref, URL, etc.
  locator?: { page?: number; section?: string; timestamp?: number };
  text?: string; // optional excerpt
}

export interface TimeRange {
  fromMs: number;
  toMs: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface GenerationParams {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
}

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

/**
 * Tldraw scene snapshot. Opaque to Praxis; persisted as JSON.
 * Real shape comes from the `tldraw` package; we keep it loose here so the
 * type module has no runtime tldraw dependency.
 */
export type TldrawSnapshot = Record<string, unknown>;
