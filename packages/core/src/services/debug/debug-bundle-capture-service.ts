import { join } from "node:path";
import { episodicEvents } from "@praxis/memory/schema";
import { asc, inArray } from "drizzle-orm";
import type { PraxisDb } from "../../db/index.js";
import type {
  DebugBundleArtifact,
  DebugBundleArtifactContent,
  DebugBundleCaptureInput,
  DebugBundleCapturePolicy,
  DebugBundleCaptureResult,
  DebugBundleCaptureService,
  DebugBundleEvidenceSource,
  DebugBundleManifest,
  DebugBundleWriter,
  DebugTraceRecord,
  DebugTraceRegistry,
  SessionId,
} from "../../types/index.js";
import { makeTurnId } from "../../types/index.js";
import { createDebugBundleWriter } from "./debug-bundle-writer.js";
import {
  type DebugLogFilters,
  type DebugLogReader,
  JsonlDebugLogReader,
} from "./debug-log-reader.js";

export interface DebugBundleCaptureServiceDeps {
  db: PraxisDb;
  debugTrace?: DebugTraceRegistry;
  writer?: DebugBundleWriter;
  logReader?: DebugLogReader;
  now?: () => Date;
  defaultOutputRoot?: string;
}

type TraceSelectionKind = "runId" | "turnId" | "callId" | "sessionId" | "none";

interface TraceSelection {
  kind: TraceSelectionKind;
  records: readonly DebugTraceRecord[];
}

interface EpisodicRow {
  id: string;
  sessionId: string;
  studentId: string;
  ts: Date;
  engineId: string;
  modeId: string;
  turnIndex: number;
  eventJson: unknown;
}

interface BundleAccumulator {
  artifacts: DebugBundleArtifactContent[];
  manifestArtifacts: DebugBundleArtifact[];
  captureEvents: DebugBundleManifest["captureEvents"];
}

export class DebugBundleCaptureServiceImpl implements DebugBundleCaptureService {
  private readonly db: PraxisDb;
  private readonly debugTrace: DebugTraceRegistry | undefined;
  private readonly writer: DebugBundleWriter;
  private readonly logReader: DebugLogReader;
  private readonly now: () => Date;
  private readonly defaultOutputRoot: string;

  constructor(deps: DebugBundleCaptureServiceDeps) {
    this.db = deps.db;
    this.debugTrace = deps.debugTrace;
    this.writer = deps.writer ?? createDebugBundleWriter();
    this.logReader = deps.logReader ?? new JsonlDebugLogReader();
    this.now = deps.now ?? (() => new Date());
    this.defaultOutputRoot =
      deps.defaultOutputRoot ?? join(process.cwd(), ".praxis", "debug", "bundles");
  }

  async capture(input: DebugBundleCaptureInput): Promise<DebugBundleCaptureResult> {
    const createdAt = this.now();
    const traceSelection = this.selectTraceRecords(input);
    const episodicRows = this.selectEpisodicRows(input, traceSelection);
    const runId = resolveRunId(input, traceSelection.records, createdAt);
    const accumulator: BundleAccumulator = {
      artifacts: [],
      manifestArtifacts: [],
      captureEvents: [],
    };

    addTraceArtifacts(accumulator, traceSelection.records);
    addEpisodicArtifact(accumulator, episodicRows);

    const correlation = buildCorrelation(input, traceSelection.records, episodicRows);
    await this.addLogArtifact(accumulator, input, correlation);
    const sessionSummary = buildSessionSummary(input, traceSelection.records, episodicRows);

    const manifest: DebugBundleManifest = {
      kind: "debug_evidence_bundle",
      schemaVersion: 1,
      runId,
      createdAt: createdAt.toISOString(),
      localOnly: true,
      exportKind: "none",
      ...(sessionSummary !== undefined && { session: sessionSummary }),
      correlation,
      artifacts: accumulator.manifestArtifacts,
      captureEvents: accumulator.captureEvents,
      summary: {
        title: input.title,
        failureClass: input.failureClass,
        ...(input.firstBadObservation !== undefined && {
          firstBadObservation: input.firstBadObservation,
        }),
        ...(input.nextDebugStep !== undefined && { nextDebugStep: input.nextDebugStep }),
      },
    };

    const outputRoot = input.outputRoot ?? this.defaultOutputRoot;
    const outputDir = join(outputRoot, sanitizePathSegment(runId));
    const result = await this.writer.write({
      outputDir,
      manifest,
      artifacts: accumulator.artifacts,
    });

    return { ...result, manifest };
  }

  private selectTraceRecords(input: DebugBundleCaptureInput): TraceSelection {
    if (this.debugTrace === undefined) return { kind: "none", records: [] };
    if (input.runId !== undefined) {
      return { kind: "runId", records: this.debugTrace.findByRunId(input.runId) };
    }
    if (input.turnId !== undefined) {
      return { kind: "turnId", records: this.debugTrace.findByTurnId(input.turnId) };
    }
    if (input.callId !== undefined) {
      return {
        kind: "callId",
        records: selectTraceRecordsForCall(this.debugTrace.list(), input.callId),
      };
    }
    if (input.sessionId !== undefined) {
      return { kind: "sessionId", records: this.debugTrace.findBySessionId(input.sessionId) };
    }
    return { kind: "none", records: [] };
  }

  private selectEpisodicRows(
    input: DebugBundleCaptureInput,
    traceSelection: TraceSelection,
  ): EpisodicRow[] {
    const candidateRows = this.readCandidateEpisodicRows(input, traceSelection.records);
    if (input.callId !== undefined) {
      const callId = input.callId;
      const anchorRows = candidateRows.filter((row) => eventHasCallId(row.eventJson, callId));
      const anchorTurns = new Set(anchorRows.map((row) => turnKey(row.sessionId, row.turnIndex)));
      for (const traceRecord of traceSelection.records) {
        const traceTurn = traceTurnKey(traceRecord);
        if (traceTurn !== undefined) anchorTurns.add(traceTurn);
      }
      if (anchorTurns.size > 0) {
        return candidateRows.filter((row) =>
          anchorTurns.has(turnKey(row.sessionId, row.turnIndex)),
        );
      }
      return [];
    }

    const targetTurns = new Set<string>();
    if (input.turnId !== undefined) targetTurns.add(input.turnId);
    for (const record of traceSelection.records) {
      if (record.trace.turnId !== undefined) targetTurns.add(record.trace.turnId);
    }
    if (
      targetTurns.size > 0 &&
      (input.turnId !== undefined ||
        traceSelection.kind === "runId" ||
        traceSelection.kind === "turnId")
    ) {
      return candidateRows.filter((row) =>
        targetTurns.has(makeTurnId(row.sessionId as SessionId, row.turnIndex)),
      );
    }
    if (traceSelection.kind === "runId" || traceSelection.kind === "turnId") {
      const traceSessionIds = new Set(
        traceSelection.records.map((record) => record.trace.sessionId),
      );
      if (traceSessionIds.size > 0) {
        return candidateRows.filter((row) => traceSessionIds.has(row.sessionId as SessionId));
      }
    }

    if (input.sessionId !== undefined) {
      return candidateRows.filter((row) => row.sessionId === input.sessionId);
    }
    return candidateRows;
  }

  private readCandidateEpisodicRows(
    input: DebugBundleCaptureInput,
    traceRecords: readonly DebugTraceRecord[],
  ): EpisodicRow[] {
    const sessionIds = new Set<string>();
    if (input.sessionId !== undefined) sessionIds.add(input.sessionId);
    const parsedTurn = input.turnId === undefined ? undefined : parseTurnId(input.turnId);
    if (parsedTurn !== undefined) sessionIds.add(parsedTurn.sessionId);
    for (const record of traceRecords) {
      sessionIds.add(record.trace.sessionId);
    }

    const query = this.db
      .select({
        id: episodicEvents.id,
        sessionId: episodicEvents.sessionId,
        studentId: episodicEvents.studentId,
        ts: episodicEvents.ts,
        engineId: episodicEvents.engineId,
        modeId: episodicEvents.modeId,
        turnIndex: episodicEvents.turnIndex,
        eventJson: episodicEvents.eventJson,
      })
      .from(episodicEvents);

    const filteredQuery =
      sessionIds.size === 0
        ? query
        : query.where(inArray(episodicEvents.sessionId, [...sessionIds]));
    return filteredQuery
      .orderBy(asc(episodicEvents.sessionId), asc(episodicEvents.turnIndex), asc(episodicEvents.ts))
      .all();
  }

  private async addLogArtifact(
    accumulator: BundleAccumulator,
    input: DebugBundleCaptureInput,
    correlation: DebugBundleManifest["correlation"],
  ): Promise<void> {
    if (input.logFilePath === undefined) {
      addMissing(accumulator, "log", "no logFilePath supplied");
      return;
    }

    try {
      const records = await this.logReader.read({
        logFilePath: input.logFilePath,
        filters: buildLogFilters(input, correlation),
      });
      if (records.length === 0) {
        addMissing(accumulator, "log", "no matching log records found");
        return;
      }
      addJsonlArtifact(accumulator, {
        path: "logs.jsonl",
        source: "log",
        capture: "full_local",
        description: "Matching pino JSONL log records.",
        records,
      });
    } catch (err) {
      addMissing(accumulator, "log", `failed to read log file: ${errorMessage(err)}`);
    }
  }
}

function addTraceArtifacts(
  accumulator: BundleAccumulator,
  traceRecords: readonly DebugTraceRecord[],
): void {
  if (traceRecords.length === 0) {
    addMissing(accumulator, "trace", "no matching debug trace records found");
    addMissing(accumulator, "tool_dispatch", "no matching tool dispatch trace records found");
    addMissing(accumulator, "subagent", "no matching sub-agent trace records found");
    addMissing(accumulator, "ipc_stream", "no matching IPC stream trace records found");
    addMissing(accumulator, "renderer", "no matching renderer outcome trace records found");
    return;
  }

  addJsonlArtifact(accumulator, {
    path: "trace-records.jsonl",
    source: "trace",
    capture: "metadata_only",
    description: "Matching compact debug trace records.",
    records: traceRecords,
  });
  addTraceSlice(
    accumulator,
    "tool-dispatch.jsonl",
    "tool_dispatch",
    traceRecords,
    (record) => record.type === "tool_dispatch_start" || record.type === "tool_dispatch_end",
  );
  addTraceSlice(
    accumulator,
    "subagent-timeline.jsonl",
    "subagent",
    traceRecords,
    (record) => record.type === "subagent_event",
  );
  addTraceSlice(
    accumulator,
    "ipc-streams.jsonl",
    "ipc_stream",
    traceRecords,
    (record) => record.type === "ipc_stream_event",
  );
  addTraceSlice(
    accumulator,
    "renderer-outcomes.jsonl",
    "renderer",
    traceRecords,
    (record) => record.type === "renderer_outcome",
  );
}

function addTraceSlice(
  accumulator: BundleAccumulator,
  path: string,
  source: DebugBundleEvidenceSource,
  traceRecords: readonly DebugTraceRecord[],
  predicate: (record: DebugTraceRecord) => boolean,
): void {
  const records = traceRecords.filter(predicate);
  if (records.length === 0) {
    addMissing(accumulator, source, `no ${source} records in trace slice`);
    return;
  }
  addJsonlArtifact(accumulator, {
    path,
    source,
    capture: "metadata_only",
    records,
  });
}

function addEpisodicArtifact(accumulator: BundleAccumulator, rows: readonly EpisodicRow[]): void {
  if (rows.length === 0) {
    addMissing(accumulator, "session_event", "no matching episodic event rows found");
    return;
  }

  addJsonlArtifact(accumulator, {
    path: "engine-events.jsonl",
    source: "session_event",
    capture: "full_local",
    description: "Full EngineEvent payloads from episodic_events.event_json.",
    records: rows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      studentId: row.studentId,
      ts: row.ts.toISOString(),
      engineId: row.engineId,
      modeId: row.modeId,
      turnIndex: row.turnIndex,
      event: row.eventJson,
    })),
  });
}

function addJsonlArtifact(
  accumulator: BundleAccumulator,
  input: {
    path: string;
    source: DebugBundleEvidenceSource;
    capture: DebugBundleCapturePolicy;
    records: readonly unknown[];
    description?: string;
  },
): void {
  accumulator.artifacts.push({
    path: input.path,
    contents: toJsonl(input.records),
  });
  accumulator.manifestArtifacts.push({
    kind: "jsonl",
    path: input.path,
    source: input.source,
    capture: input.capture,
    ...(input.description !== undefined && { description: input.description }),
  });
  accumulator.captureEvents.push({
    type: "evidence_captured",
    source: input.source,
    artifactPath: input.path,
  });
}

function addMissing(
  accumulator: BundleAccumulator,
  source: DebugBundleEvidenceSource,
  reason: string,
): void {
  accumulator.captureEvents.push({ type: "evidence_missing", source, reason });
}

function buildCorrelation(
  input: DebugBundleCaptureInput,
  traceRecords: readonly DebugTraceRecord[],
  episodicRows: readonly EpisodicRow[],
): DebugBundleManifest["correlation"] {
  const turnIds = new Set<string>();
  const callIds = new Set<string>();
  const parentCallIds = new Set<string>();
  const streamIds = new Set<string>();
  const rendererEventIds = new Set<string>();

  if (input.turnId !== undefined) turnIds.add(input.turnId);
  if (input.callId !== undefined) callIds.add(input.callId);
  for (const record of traceRecords) {
    addDefined(turnIds, record.trace.turnId);
    addDefined(callIds, record.trace.callId);
    addDefined(parentCallIds, record.trace.parentCallId);
    addDefined(streamIds, record.trace.streamId);
    addDefined(rendererEventIds, record.trace.rendererEventId);
  }
  for (const row of episodicRows) {
    turnIds.add(makeTurnId(row.sessionId as SessionId, row.turnIndex));
    const callId = eventCallId(row.eventJson);
    addDefined(callIds, callId);
  }

  return {
    turnIds: [...turnIds].sort(),
    callIds: [...callIds].sort(),
    parentCallIds: [...parentCallIds].sort(),
    streamIds: [...streamIds].sort(),
    rendererEventIds: [...rendererEventIds].sort(),
  };
}

function buildSessionSummary(
  input: DebugBundleCaptureInput,
  traceRecords: readonly DebugTraceRecord[],
  episodicRows: readonly EpisodicRow[],
): DebugBundleManifest["session"] | undefined {
  const sessionId =
    input.sessionId ?? episodicRows[0]?.sessionId ?? traceRecords[0]?.trace.sessionId;
  if (sessionId === undefined) return undefined;
  const row = episodicRows.find((candidate) => candidate.sessionId === sessionId);
  const turnStart = traceRecords.find((record) => record.type === "turn_start");
  return {
    sessionId: sessionId as SessionId,
    ...(row?.modeId !== undefined && { modeId: row.modeId }),
    ...(row?.engineId !== undefined && { engineId: row.engineId }),
    ...(row === undefined && turnStart?.type === "turn_start" && { modeId: turnStart.modeId }),
    ...(row === undefined && turnStart?.type === "turn_start" && { engineId: turnStart.engineId }),
  };
}

function buildLogFilters(
  input: DebugBundleCaptureInput,
  correlation: DebugBundleManifest["correlation"],
): DebugLogFilters {
  return {
    ...(input.runId !== undefined && { runIds: [input.runId] }),
    ...(input.sessionId !== undefined && { sessionIds: [input.sessionId] }),
    ...(correlation.turnIds.length > 0 && { turnIds: correlation.turnIds }),
    ...(correlation.callIds.length > 0 && { callIds: correlation.callIds }),
    ...(correlation.streamIds.length > 0 && { streamIds: correlation.streamIds }),
    ...(correlation.rendererEventIds.length > 0 && {
      rendererEventIds: correlation.rendererEventIds,
    }),
  };
}

function selectTraceRecordsForCall(
  records: readonly DebugTraceRecord[],
  callId: string,
): readonly DebugTraceRecord[] {
  const anchorRecords = records.filter(
    (record) => record.trace.callId === callId || record.trace.parentCallId === callId,
  );
  const turnIds = new Set(anchorRecords.flatMap((record) => toArray(record.trace.turnId)));
  if (turnIds.size > 0) {
    return records.filter(
      (record) => record.trace.turnId !== undefined && turnIds.has(record.trace.turnId),
    );
  }
  const sessionIds = new Set(anchorRecords.map((record) => record.trace.sessionId));
  if (sessionIds.size > 0) {
    return records.filter((record) => sessionIds.has(record.trace.sessionId));
  }
  return [];
}

function traceTurnKey(record: DebugTraceRecord): string | undefined {
  const turnId = record.trace.turnId;
  if (turnId !== undefined) return turnId;
  if (record.trace.turnIndex === undefined) return undefined;
  return makeTurnId(record.trace.sessionId, record.trace.turnIndex);
}

function eventHasCallId(event: unknown, callId: string): boolean {
  return eventCallId(event) === callId;
}

function eventCallId(event: unknown): string | undefined {
  if (!isRecord(event)) return undefined;
  const callId = event.callId;
  return typeof callId === "string" ? callId : undefined;
}

function parseTurnId(turnId: string): { sessionId: string; turnIndex: number } | undefined {
  const match = /^(.*):turn:(\d+)$/.exec(turnId);
  if (match === null) return undefined;
  const [, sessionId, turnIndexText] = match;
  const turnIndex = Number(turnIndexText);
  if (sessionId === undefined || !Number.isInteger(turnIndex)) return undefined;
  return { sessionId, turnIndex };
}

function resolveRunId(
  input: Pick<DebugBundleCaptureInput, "runId">,
  traceRecords: readonly DebugTraceRecord[],
  createdAt: Date,
): string {
  return input.runId ?? traceRecords[0]?.trace.runId ?? `debug-${createdAt.getTime()}`;
}

function turnKey(sessionId: string, turnIndex: number): string {
  return makeTurnId(sessionId as SessionId, turnIndex);
}

function sanitizePathSegment(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9._-]/g, "_");
  return sanitized.length === 0 ? "debug-bundle" : sanitized;
}

function toJsonl(records: readonly unknown[]): string {
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

function toArray<T>(value: T | undefined): T[] {
  return value === undefined ? [] : [value];
}

function addDefined<T>(set: Set<T>, value: T | undefined): void {
  if (value !== undefined) set.add(value);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
