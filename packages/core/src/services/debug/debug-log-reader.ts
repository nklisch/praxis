import { readFile } from "node:fs/promises";

export interface DebugLogFilters {
  runIds?: readonly string[];
  sessionIds?: readonly string[];
  turnIds?: readonly string[];
  callIds?: readonly string[];
  streamIds?: readonly string[];
  rendererEventIds?: readonly string[];
}

export interface DebugLogReader {
  read(input: { logFilePath: string; filters: DebugLogFilters }): Promise<readonly unknown[]>;
}

export class JsonlDebugLogReader implements DebugLogReader {
  async read(input: {
    logFilePath: string;
    filters: DebugLogFilters;
  }): Promise<readonly unknown[]> {
    const text = await readFile(input.logFilePath, "utf8");
    return text
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => parseJsonLine(line))
      .filter((record) => recordMatchesFilters(record, input.filters));
  }
}

function parseJsonLine(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return { malformed: true, line };
  }
}

function recordMatchesFilters(record: unknown, filters: DebugLogFilters): boolean {
  const clauses = [
    ["runId", filters.runIds],
    ["sessionId", filters.sessionIds],
    ["turnId", filters.turnIds],
    ["callId", filters.callIds],
    ["streamId", filters.streamIds],
    ["rendererEventId", filters.rendererEventIds],
  ] as const;
  const activeClauses = clauses.filter(([, values]) => values !== undefined && values.length > 0);
  if (activeClauses.length === 0) return true;
  return activeClauses.some(([key, values]) => hasAnyValue(record, key, values ?? []));
}

function hasAnyValue(record: unknown, key: string, expected: readonly string[]): boolean {
  if (!isRecord(record)) return false;
  for (const container of [
    record,
    objectField(record, "fields"),
    objectField(record, "bindings"),
    objectField(record, "trace"),
  ]) {
    const value = container?.[key];
    if (typeof value === "string" && expected.includes(value)) return true;
  }
  return false;
}

function objectField(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
