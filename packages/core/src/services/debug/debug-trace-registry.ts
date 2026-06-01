import type {
  DebugRunId,
  DebugTraceRecord,
  DebugTraceRecordInput,
  DebugTraceRegistry,
  DebugTurnId,
  SessionId,
  Timestamp,
} from "../../types/index.js";

export const DEFAULT_DEBUG_TRACE_MAX_RECORDS = 200;

export interface DebugTraceRegistryDeps {
  now?: () => number;
  maxRecords?: number;
}

export class DebugTraceRegistryImpl implements DebugTraceRegistry {
  private readonly records: DebugTraceRecord[] = [];
  private readonly now: () => number;
  private readonly maxRecords: number;

  constructor(deps: DebugTraceRegistryDeps = {}) {
    this.now = deps.now ?? Date.now;
    this.maxRecords = normalizeMaxRecords(deps.maxRecords ?? DEFAULT_DEBUG_TRACE_MAX_RECORDS);
  }

  record(input: DebugTraceRecordInput): DebugTraceRecord {
    const record: DebugTraceRecord = {
      ...input,
      recordedAt: this.now() as Timestamp,
    };
    this.records.push(record);
    this.evictOldest();
    return record;
  }

  list(): readonly DebugTraceRecord[] {
    return [...this.records];
  }

  findByRunId(runId: DebugRunId): readonly DebugTraceRecord[] {
    return this.records.filter((record) => record.trace.runId === runId);
  }

  findBySessionId(sessionId: SessionId): readonly DebugTraceRecord[] {
    return this.records.filter((record) => record.trace.sessionId === sessionId);
  }

  findByTurnId(turnId: DebugTurnId): readonly DebugTraceRecord[] {
    return this.records.filter((record) => record.trace.turnId === turnId);
  }

  clear(): void {
    this.records.length = 0;
  }

  private evictOldest(): void {
    const overflow = this.records.length - this.maxRecords;
    if (overflow <= 0) return;
    this.records.splice(0, overflow);
  }
}

function normalizeMaxRecords(value: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    throw new Error(`debug trace maxRecords must be a positive integer: ${value}`);
  }
  return value;
}
