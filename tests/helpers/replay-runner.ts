import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assignmentResponses,
  assignments,
  courses,
  documentScopes,
  documents,
} from "@praxis/artifacts/schema";
import type { PraxisDb, SqliteDatabase } from "@praxis/core/db";
import { openDb } from "@praxis/core/db";
import { runMigrations } from "@praxis/core/db/migrate";
import { drafts } from "@praxis/core/schema";
import type { ServiceDeps } from "@praxis/core/services";
import { DebugTraceRegistryImpl, SessionServiceImpl } from "@praxis/core/services";
import type {
  DebugTraceRecord,
  DocumentScopesService,
  EngineEvent,
  LockService,
  Logger,
  Mode,
  SecretStorage,
  SessionId,
} from "@praxis/core/types";
import { episodicEvents, sessions } from "@praxis/memory/schema";
import { and, asc, eq, gte } from "drizzle-orm";
import { ReplayEngine, type ReplayTurn } from "./replay-engine.js";

export class ReplayBundleLoadError extends Error {
  constructor(
    readonly code: "manifest_missing" | "manifest_invalid" | "artifact_missing",
    message: string,
  ) {
    super(message);
    this.name = "DebugBundleLoadError";
  }
}

interface ReplayBundleManifest {
  session?: { sessionId?: SessionId };
  captureEvents: readonly unknown[];
}

type DebugSnapshotTableName =
  | "courses"
  | "documents"
  | "sessions"
  | "drafts"
  | "assignments"
  | "assignment_responses"
  | "document_scopes"
  | "episodic_events";

interface DebugDbSnapshot {
  schemaVersion: 1;
  tables: Array<{ name: DebugSnapshotTableName; rows: readonly Record<string, unknown>[] }>;
}

export interface ReplayDebugBundleResult {
  manifest: ReplayBundleManifest;
  replayedTurn: ReplayTurn;
  yieldedEvents: readonly EngineEvent[];
  traceRecords: readonly DebugTraceRecord[];
  episodicRows: readonly unknown[];
  limitations: readonly string[];
}

export async function replayDebugBundle(input: {
  bundleDir: string;
  dbPath: string;
}): Promise<ReplayDebugBundleResult> {
  const loaded = await loadReplayBundle(input.bundleDir, [
    "db-snapshot.json",
    "engine-events.jsonl",
  ]);
  const snapshot = parseJson<DebugDbSnapshot>(
    await loaded.readArtifactText("db-snapshot.json"),
    "db-snapshot.json",
  );
  const engineEventRows = parseEngineEventRows(
    await loaded.readArtifactText("engine-events.jsonl"),
  );
  const turns = buildReplayTurns(engineEventRows);
  const replayedTurn = turns[0];
  if (replayedTurn === undefined) {
    throw new Error("debug replay requires at least one recorded turn with a user_message event");
  }

  runMigrations({ path: input.dbPath, migrationsFolder: join(process.cwd(), "drizzle") });
  const { db, sqlite } = openDb({ path: input.dbPath });
  try {
    restoreSnapshot(db, snapshot);
    const sessionId = resolveSessionId(loaded.manifest, engineEventRows);
    pruneReplayTurn(db, sessionId, replayedTurn.turnIndex);
    const debugTrace = new DebugTraceRegistryImpl();
    const service = makeReplaySessionService(db, debugTrace, replayedTurn, sessionId);
    const yieldedEvents: EngineEvent[] = [];
    for await (const event of service.send(sessionId, replayedTurn.userMessage)) {
      yieldedEvents.push(event);
    }
    const episodicRows = db
      .select()
      .from(episodicEvents)
      .where(eq(episodicEvents.sessionId, sessionId))
      .orderBy(asc(episodicEvents.turnIndex), asc(episodicEvents.ts))
      .all();

    return {
      manifest: loaded.manifest,
      replayedTurn,
      yieldedEvents,
      traceRecords: debugTrace.list(),
      episodicRows,
      limitations: REPLAY_LIMITATIONS,
    };
  } finally {
    closeSqlite(sqlite);
  }
}

export const REPLAY_LIMITATIONS = [
  "Session-service replay does not re-run external model behavior.",
  "Vector search indexes and file-system document assets are not reconstructed.",
  "Renderer DOM state, browser layout, and timing races are inspected from artifacts, not re-executed.",
] as const;

interface EngineEventArtifactRow {
  sessionId: SessionId;
  turnIndex: number;
  event: EngineEvent;
}

function buildReplayTurns(rows: readonly EngineEventArtifactRow[]): ReplayTurn[] {
  const byTurn = new Map<number, EngineEventArtifactRow[]>();
  for (const row of rows) {
    const existing = byTurn.get(row.turnIndex) ?? [];
    existing.push(row);
    byTurn.set(row.turnIndex, existing);
  }
  return [...byTurn.entries()]
    .sort(([left], [right]) => left - right)
    .map(([turnIndex, turnRows]) => {
      const userMessage = turnRows.find((row) => row.event.type === "user_message")?.event;
      if (userMessage?.type !== "user_message") {
        throw new Error(`debug replay turn ${turnIndex} has no user_message event`);
      }
      return {
        turnIndex,
        userMessage: userMessage.content,
        events: turnRows
          .map((row) => row.event)
          .filter(
            (event): event is Exclude<EngineEvent, { type: "user_message" }> =>
              event.type !== "user_message",
          ),
      };
    });
}

function makeReplaySessionService(
  db: PraxisDb,
  debugTrace: DebugTraceRegistryImpl,
  replayedTurn: ReplayTurn,
  sessionId: SessionId,
): SessionServiceImpl {
  const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (session === undefined) throw new Error(`debug replay session not restored: ${sessionId}`);
  const mode = makeMode(session.modeId);
  const replayEngine = new ReplayEngine({ turns: [replayedTurn] });
  const deps: ServiceDeps = {
    db,
    log: noopLogger(),
    modes: new Map([[mode.id, mode]]),
    toolDefinitions: [],
    toolServices: {
      documentScopes: noopDocumentScopes(),
    } as unknown as ServiceDeps["toolServices"],
    lockService: noopLockService(),
    secretStorage: inMemorySecretStorage(),
    debugTrace,
    engineFactory: () => replayEngine,
  };
  return new SessionServiceImpl(deps);
}

function makeMode(id: string): Mode {
  return {
    id,
    label: id,
    displayName: id,
    description: "",
    requiredRole: "student",
    uiSurface: "chat",
    toolNames: [],
    promptFragments: [],
  };
}

function pruneReplayTurn(db: PraxisDb, sessionId: SessionId, turnIndex: number): void {
  db.delete(episodicEvents)
    .where(and(eq(episodicEvents.sessionId, sessionId), gte(episodicEvents.turnIndex, turnIndex)))
    .run();
}

function resolveSessionId(
  manifest: ReplayBundleManifest,
  rows: readonly EngineEventArtifactRow[],
): SessionId {
  const sessionId = manifest.session?.sessionId ?? rows[0]?.sessionId;
  if (sessionId === undefined) throw new Error("debug replay could not resolve sessionId");
  return sessionId as SessionId;
}

function parseEngineEventRows(text: string): EngineEventArtifactRow[] {
  return text
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line): EngineEventArtifactRow => {
      const value = parseJson<unknown>(line, "engine-events.jsonl");
      if (!isRecord(value) || typeof value.turnIndex !== "number" || !isRecord(value.event)) {
        throw new Error("engine-events.jsonl row has unsupported shape");
      }
      const sessionId = value.sessionId;
      if (typeof sessionId !== "string") {
        throw new Error("engine-events.jsonl row is missing sessionId");
      }
      const event = value.event;
      if (typeof event.type !== "string") {
        throw new Error("engine-events.jsonl row event is missing type");
      }
      return {
        sessionId: sessionId as SessionId,
        turnIndex: value.turnIndex,
        event: event as unknown as EngineEvent,
      };
    });
}

function parseJson<T>(text: string, label: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Error(
      `${label} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function closeSqlite(sqlite: SqliteDatabase): void {
  sqlite.close();
}

async function loadReplayBundle(
  bundleDir: string,
  requiredArtifacts: readonly string[],
): Promise<{
  manifest: ReplayBundleManifest;
  readArtifactText(path: string): Promise<string>;
}> {
  const manifestPath = join(bundleDir, "manifest.json");
  let manifestText: string;
  try {
    manifestText = await readFile(manifestPath, "utf8");
  } catch (err) {
    throw new ReplayBundleLoadError(
      "manifest_missing",
      `debug bundle manifest not found: ${manifestPath} (${errorMessage(err)})`,
    );
  }
  const manifest = parseJson<ReplayBundleManifest>(manifestText, "manifest.json");
  const loaded = {
    manifest,
    readArtifactText: (path: string) => readBundleArtifact(bundleDir, path),
  };
  for (const artifactPath of requiredArtifacts) {
    await loaded.readArtifactText(artifactPath);
  }
  return loaded;
}

async function readBundleArtifact(bundleDir: string, path: string): Promise<string> {
  const normalized = normalizeBundlePath(path);
  try {
    return await readFile(join(bundleDir, ...normalized.split("/")), "utf8");
  } catch (err) {
    throw new ReplayBundleLoadError(
      "artifact_missing",
      `debug bundle artifact not found: ${normalized} (${errorMessage(err)})`,
    );
  }
}

function normalizeBundlePath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.split("/").some((part) => part.length === 0 || part === "." || part === "..")
  ) {
    throw new ReplayBundleLoadError(
      "artifact_missing",
      `debug bundle artifact path is unsafe: ${path}`,
    );
  }
  return normalized;
}

function restoreSnapshot(db: PraxisDb, snapshot: DebugDbSnapshot): void {
  for (const tableName of RESTORE_ORDER) {
    const rows = snapshot.tables.find((table) => table.name === tableName)?.rows ?? [];
    if (rows.length === 0) continue;
    insertSnapshotRows(db, tableName, rows);
  }
}

const RESTORE_ORDER: DebugSnapshotTableName[] = [
  "courses",
  "documents",
  "sessions",
  "drafts",
  "assignments",
  "assignment_responses",
  "document_scopes",
  "episodic_events",
];

function insertSnapshotRows(
  db: PraxisDb,
  tableName: DebugSnapshotTableName,
  rows: readonly Record<string, unknown>[],
): void {
  switch (tableName) {
    case "courses":
      db.insert(courses)
        .values(rows.map((row) => hydrateRow(tableName, row) as typeof courses.$inferInsert))
        .onConflictDoNothing()
        .run();
      return;
    case "documents":
      db.insert(documents)
        .values(rows.map((row) => hydrateRow(tableName, row) as typeof documents.$inferInsert))
        .onConflictDoNothing()
        .run();
      return;
    case "sessions":
      db.insert(sessions)
        .values(rows.map((row) => hydrateRow(tableName, row) as typeof sessions.$inferInsert))
        .onConflictDoNothing()
        .run();
      return;
    case "drafts":
      db.insert(drafts)
        .values(rows.map((row) => hydrateRow(tableName, row) as typeof drafts.$inferInsert))
        .onConflictDoNothing()
        .run();
      return;
    case "assignments":
      db.insert(assignments)
        .values(rows.map((row) => hydrateRow(tableName, row) as typeof assignments.$inferInsert))
        .onConflictDoNothing()
        .run();
      return;
    case "assignment_responses":
      db.insert(assignmentResponses)
        .values(
          rows.map((row) => hydrateRow(tableName, row) as typeof assignmentResponses.$inferInsert),
        )
        .onConflictDoNothing()
        .run();
      return;
    case "document_scopes":
      db.insert(documentScopes)
        .values(rows.map((row) => hydrateRow(tableName, row) as typeof documentScopes.$inferInsert))
        .onConflictDoNothing()
        .run();
      return;
    case "episodic_events":
      db.insert(episodicEvents)
        .values(rows.map((row) => hydrateRow(tableName, row) as typeof episodicEvents.$inferInsert))
        .onConflictDoNothing()
        .run();
      return;
  }
}

function hydrateRow(
  tableName: DebugSnapshotTableName,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const timestampColumns = TIMESTAMP_COLUMNS[tableName];
  const hydrated: Record<string, unknown> = { ...row };
  for (const column of timestampColumns) {
    const value = hydrated[column];
    if (typeof value === "string") hydrated[column] = new Date(value);
  }
  return hydrated;
}

const TIMESTAMP_COLUMNS: Record<DebugSnapshotTableName, readonly string[]> = {
  courses: ["createdAt", "updatedAt"],
  documents: ["ingestedAt"],
  sessions: ["startedAt", "endedAt"],
  drafts: ["createdAt", "lastTouchedAt", "confirmedAt", "discardedAt"],
  assignments: ["assignedAt", "submittedAt"],
  assignment_responses: ["recordedAt"],
  document_scopes: ["attachedAt"],
  episodic_events: ["ts", "redactedAt"],
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function noopLogger(): Logger {
  const logger: Logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    child: () => logger,
  };
  return logger;
}

function inMemorySecretStorage(): SecretStorage {
  return {
    isAvailable: () => true,
    encrypt: (plaintext) => Buffer.from(plaintext, "utf8").toString("base64"),
    decrypt: (b64) => {
      try {
        return Buffer.from(b64, "base64").toString("utf8");
      } catch {
        return null;
      }
    },
  };
}

function noopLockService(): LockService {
  return {
    isSet: async () => false,
    isUnlocked: async () => true,
    setLockCode: async () => {},
    unlock: async () => ({ ok: true }),
    lock: async () => {},
    clearLock: async () => {},
  };
}

function noopDocumentScopes(): DocumentScopesService {
  return {
    listForScope: async () => [],
    listForScopeDetailed: async () => [],
    attach: async () => ({ attached: false }),
    detach: async () => ({ detached: false }),
    attachMany: async () => ({ newlyAttached: [] }),
    listScopesForDocument: async () => [],
    promoteScope: async () => ({ promoted: [] }),
    listOrphaned: async () => [],
  };
}
