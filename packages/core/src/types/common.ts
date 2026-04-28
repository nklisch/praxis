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

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

/**
 * Tldraw scene snapshot. Opaque to Praxis; persisted as JSON.
 * Real shape comes from the `tldraw` package; we keep it loose here so the
 * type module has no runtime tldraw dependency.
 */
export type TldrawSnapshot = Record<string, unknown>;
