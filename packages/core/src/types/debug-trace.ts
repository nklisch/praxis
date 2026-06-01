import type { Timestamp } from "./common.js";
import type { SessionId } from "./ids.js";

export type DebugRunId = string;
export type DebugTurnId = string;

export interface DebugTraceContext {
  runId: DebugRunId;
  sessionId: SessionId;
  turnId?: DebugTurnId;
  turnIndex?: number;
  callId?: string;
  parentCallId?: string;
  streamId?: string;
  rendererEventId?: string;
}

export interface DebugTraceArtifactPointer {
  id: string;
  label?: string;
  mediaType?: string;
  uri?: string;
}

interface DebugTraceRecordBase {
  trace: DebugTraceContext;
  summary?: string;
  artifacts?: readonly DebugTraceArtifactPointer[];
}

export type DebugTraceRecordInput =
  | (DebugTraceRecordBase & {
      type: "turn_start";
      modeId: string;
      engineId: string;
    })
  | (DebugTraceRecordBase & {
      type: "engine_event";
      eventType: string;
      eventId?: string;
    })
  | (DebugTraceRecordBase & {
      type: "tool_dispatch_start";
      toolName: string;
    })
  | (DebugTraceRecordBase & {
      type: "tool_dispatch_end";
      toolName: string;
      ok: boolean;
      durationMs: number;
    })
  | (DebugTraceRecordBase & {
      type: "subagent_event";
      phase: string;
    })
  | (DebugTraceRecordBase & {
      type: "ipc_stream_event";
      channel: string;
      eventType: string;
      eventCount: number;
    })
  | (DebugTraceRecordBase & {
      type: "renderer_outcome";
      surface: string;
      eventType: string;
      outcome: string;
    });

export type DebugTraceRecord = DebugTraceRecordInput & {
  recordedAt: Timestamp;
};

export interface DebugTraceRegistry {
  record(record: DebugTraceRecordInput): DebugTraceRecord;
  list(): readonly DebugTraceRecord[];
  findByRunId(runId: DebugRunId): readonly DebugTraceRecord[];
  findBySessionId(sessionId: SessionId): readonly DebugTraceRecord[];
  findByTurnId(turnId: DebugTurnId): readonly DebugTraceRecord[];
  clear(): void;
}

export function makeTurnId(sessionId: SessionId, turnIndex: number): DebugTurnId {
  if (!Number.isInteger(turnIndex) || turnIndex < 0) {
    throw new Error(`turnIndex must be a non-negative integer: ${turnIndex}`);
  }
  return `${sessionId}:turn:${turnIndex}`;
}
