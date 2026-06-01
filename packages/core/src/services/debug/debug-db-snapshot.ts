import {
  assignmentResponses,
  assignments,
  courses,
  documentScopes,
  documents,
} from "@praxis/artifacts/schema";
import { episodicEvents, sessions } from "@praxis/memory/schema";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import type { PraxisDb } from "../../db/index.js";
import { drafts } from "../../schema.js";
import type { SessionId } from "../../types/index.js";

export type DebugSnapshotTableName =
  | "courses"
  | "documents"
  | "sessions"
  | "drafts"
  | "assignments"
  | "assignment_responses"
  | "document_scopes"
  | "episodic_events";

export interface DebugDbSnapshotTable {
  name: DebugSnapshotTableName;
  rows: readonly Record<string, unknown>[];
}

export interface DebugDbSnapshotRelationship {
  kind: "present" | "missing";
  table: string;
  id: string;
  reason?: string;
}

export interface DebugDbSnapshot {
  schemaVersion: 1;
  tables: DebugDbSnapshotTable[];
  relationships: DebugDbSnapshotRelationship[];
}

export interface DebugDbSnapshotter {
  capture(input: { sessionId?: SessionId; callIds?: readonly string[] }): Promise<DebugDbSnapshot>;
  restore(input: { snapshot: DebugDbSnapshot; db: PraxisDb }): Promise<void>;
}

export class DebugDbSnapshotterImpl implements DebugDbSnapshotter {
  constructor(private readonly db: PraxisDb) {}

  async capture(input: {
    sessionId?: SessionId;
    callIds?: readonly string[];
  }): Promise<DebugDbSnapshot> {
    const sessionIds = this.resolveSessionIds(input);
    const sessionRows = selectSessions(this.db, sessionIds);
    const episodicRows = selectEpisodicEvents(this.db, sessionIds);
    const assignmentIds = new Set(sessionRows.flatMap((row) => toArray(row.assignmentId)));
    const assignmentRows = selectAssignments(this.db, assignmentIds);
    const responseRows = selectAssignmentResponses(this.db, assignmentIds);
    const courseIds = new Set([
      ...sessionRows.flatMap((row) => toArray(row.courseId)),
      ...assignmentRows.map((row) => row.courseId),
    ]);
    const courseRows = selectCourses(this.db, courseIds);
    const studentIds = new Set(sessionRows.map((row) => row.studentId));
    const draftRows = selectDrafts(this.db, studentIds);
    const documentScopeRows = selectDocumentScopes(this.db, sessionIds, courseIds);
    const documentIds = new Set(documentScopeRows.map((row) => row.documentId));
    const documentRows = selectDocuments(this.db, documentIds);
    const relationships = buildRelationships({
      sessionRows,
      episodicRows,
      assignmentRows,
      responseRows,
      courseRows,
      documentScopeRows,
      documentRows,
      sessionIds,
      courseIds,
    });

    return {
      schemaVersion: 1,
      tables: nonEmptyTables([
        table("courses", courseRows),
        table("documents", documentRows),
        table("sessions", sessionRows),
        table("drafts", draftRows),
        table("assignments", assignmentRows),
        table("assignment_responses", responseRows),
        table("document_scopes", documentScopeRows),
        table("episodic_events", episodicRows),
      ]),
      relationships,
    };
  }

  async restore(input: { snapshot: DebugDbSnapshot; db: PraxisDb }): Promise<void> {
    restoreDebugDbSnapshot(input.db, input.snapshot);
  }

  private resolveSessionIds(input: {
    sessionId?: SessionId;
    callIds?: readonly string[];
  }): Set<string> {
    const sessionIds = new Set<string>();
    if (input.sessionId !== undefined) sessionIds.add(input.sessionId);
    if (input.callIds === undefined || input.callIds.length === 0) return sessionIds;

    const callIds = new Set(input.callIds);
    const rows = this.db
      .select({
        sessionId: episodicEvents.sessionId,
      })
      .from(episodicEvents)
      .where(
        inArray(sql<string>`json_extract(${episodicEvents.eventJson}, '$.callId')`, [...callIds]),
      )
      .all();
    for (const row of rows) {
      sessionIds.add(row.sessionId);
    }
    return sessionIds;
  }
}

export function restoreDebugDbSnapshot(db: PraxisDb, snapshot: DebugDbSnapshot): void {
  for (const tableName of RESTORE_ORDER) {
    const rows = snapshot.tables.find((entry) => entry.name === tableName)?.rows ?? [];
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

function selectSessions(db: PraxisDb, sessionIds: ReadonlySet<string>) {
  if (sessionIds.size === 0) return [];
  return db
    .select()
    .from(sessions)
    .where(inArray(sessions.id, [...sessionIds]))
    .orderBy(asc(sessions.startedAt))
    .all();
}

function selectEpisodicEvents(db: PraxisDb, sessionIds: ReadonlySet<string>) {
  if (sessionIds.size === 0) return [];
  return db
    .select()
    .from(episodicEvents)
    .where(inArray(episodicEvents.sessionId, [...sessionIds]))
    .orderBy(asc(episodicEvents.sessionId), asc(episodicEvents.turnIndex), asc(episodicEvents.ts))
    .all();
}

function selectCourses(db: PraxisDb, courseIds: ReadonlySet<string>) {
  if (courseIds.size === 0) return [];
  return db
    .select()
    .from(courses)
    .where(inArray(courses.id, [...courseIds]))
    .orderBy(asc(courses.createdAt))
    .all();
}

function selectAssignments(db: PraxisDb, assignmentIds: ReadonlySet<string>) {
  if (assignmentIds.size === 0) return [];
  return db
    .select()
    .from(assignments)
    .where(inArray(assignments.id, [...assignmentIds]))
    .orderBy(asc(assignments.assignedAt))
    .all();
}

function selectAssignmentResponses(db: PraxisDb, assignmentIds: ReadonlySet<string>) {
  if (assignmentIds.size === 0) return [];
  return db
    .select()
    .from(assignmentResponses)
    .where(inArray(assignmentResponses.assignmentId, [...assignmentIds]))
    .orderBy(asc(assignmentResponses.assignmentId), asc(assignmentResponses.itemId))
    .all();
}

function selectDrafts(db: PraxisDb, studentIds: ReadonlySet<string>) {
  if (studentIds.size === 0) return [];
  return db
    .select()
    .from(drafts)
    .where(inArray(drafts.studentId, [...studentIds]))
    .orderBy(asc(drafts.createdAt))
    .all();
}

function selectDocumentScopes(
  db: PraxisDb,
  sessionIds: ReadonlySet<string>,
  courseIds: ReadonlySet<string>,
) {
  const conditions = [
    ...[...sessionIds].map((sessionId) =>
      and(eq(documentScopes.scopeKind, "session"), eq(documentScopes.scopeId, sessionId)),
    ),
    ...[...courseIds].map((courseId) =>
      and(eq(documentScopes.scopeKind, "course"), eq(documentScopes.scopeId, courseId)),
    ),
  ];
  if (conditions.length === 0) return [];
  return db
    .select()
    .from(documentScopes)
    .where(or(...conditions))
    .orderBy(
      asc(documentScopes.scopeKind),
      asc(documentScopes.scopeId),
      asc(documentScopes.documentId),
    )
    .all();
}

function selectDocuments(db: PraxisDb, documentIds: ReadonlySet<string>) {
  if (documentIds.size === 0) return [];
  return db
    .select()
    .from(documents)
    .where(inArray(documents.id, [...documentIds]))
    .orderBy(asc(documents.ingestedAt))
    .all();
}

function buildRelationships(input: {
  sessionRows: readonly (typeof sessions.$inferSelect)[];
  episodicRows: readonly (typeof episodicEvents.$inferSelect)[];
  assignmentRows: readonly (typeof assignments.$inferSelect)[];
  responseRows: readonly (typeof assignmentResponses.$inferSelect)[];
  courseRows: readonly (typeof courses.$inferSelect)[];
  documentScopeRows: readonly (typeof documentScopes.$inferSelect)[];
  documentRows: readonly (typeof documents.$inferSelect)[];
  sessionIds: ReadonlySet<string>;
  courseIds: ReadonlySet<string>;
}): DebugDbSnapshotRelationship[] {
  const relationships: DebugDbSnapshotRelationship[] = [];
  const coursesById = new Set(input.courseRows.map((row) => row.id));
  const assignmentsById = new Set(input.assignmentRows.map((row) => row.id));
  const sessionsById = new Set(input.sessionRows.map((row) => row.id));
  const documentsById = new Set(input.documentRows.map((row) => row.id));
  const responsesByAssignmentId = new Set(input.responseRows.map((row) => row.assignmentId));
  const documentScopeKeys = new Set(
    input.documentScopeRows.map((row) => `${row.scopeKind}:${row.scopeId}:${row.documentId}`),
  );

  for (const session of input.sessionRows) {
    if (session.courseId !== null) {
      relationships.push(presence("courses", session.courseId, coursesById.has(session.courseId)));
    }
    if (session.assignmentId !== null) {
      relationships.push(
        presence("assignments", session.assignmentId, assignmentsById.has(session.assignmentId)),
      );
    }
  }

  for (const assignment of input.assignmentRows) {
    relationships.push(
      presence("courses", assignment.courseId, coursesById.has(assignment.courseId)),
    );
    relationships.push({
      kind: responsesByAssignmentId.has(assignment.id) ? "present" : "missing",
      table: "assignment_responses",
      id: assignment.id,
      reason: responsesByAssignmentId.has(assignment.id)
        ? "assignment response rows captured for assignment"
        : "no assignment response rows found for assignment",
    });
  }

  for (const scope of input.documentScopeRows) {
    relationships.push(
      presence("documents", scope.documentId, documentsById.has(scope.documentId)),
    );
    if (scope.scopeKind === "session") {
      relationships.push(presence("sessions", scope.scopeId, sessionsById.has(scope.scopeId)));
    } else {
      relationships.push(presence("courses", scope.scopeId, coursesById.has(scope.scopeId)));
    }
  }

  for (const document of input.documentRows) {
    if (document.chunkCount > 0) {
      relationships.push({
        kind: "present",
        table: "document_chunks",
        id: document.id,
        reason: `omitted ${document.chunkCount} document chunk rows from focused debug snapshot`,
      });
    }
  }

  for (const sessionId of input.sessionIds) {
    const hasSessionScope = [...documentScopeKeys].some((key) =>
      key.startsWith(`session:${sessionId}:`),
    );
    if (!hasSessionScope) {
      relationships.push({
        kind: "missing",
        table: "document_scopes",
        id: sessionId,
        reason: "no session-scoped documents found for captured session",
      });
    }
  }
  for (const courseId of input.courseIds) {
    const hasCourseScope = [...documentScopeKeys].some((key) =>
      key.startsWith(`course:${courseId}:`),
    );
    if (!hasCourseScope) {
      relationships.push({
        kind: "missing",
        table: "document_scopes",
        id: courseId,
        reason: "no course-scoped documents found for captured course",
      });
    }
  }

  if (input.episodicRows.length === 0 && input.sessionRows.length > 0) {
    for (const session of input.sessionRows) {
      relationships.push({
        kind: "missing",
        table: "episodic_events",
        id: session.id,
        reason: "no episodic rows found for captured session",
      });
    }
  }

  return relationships;
}

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

function table<T extends Record<string, unknown>>(
  name: DebugSnapshotTableName,
  rows: readonly T[],
): DebugDbSnapshotTable {
  return { name, rows: rows.map(serializeRow) };
}

function nonEmptyTables(tables: readonly DebugDbSnapshotTable[]): DebugDbSnapshotTable[] {
  return tables.filter((entry) => entry.rows.length > 0);
}

function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const serialized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    serialized[key] = value instanceof Date ? value.toISOString() : value;
  }
  return serialized;
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

function presence(tableName: string, id: string, isPresent: boolean): DebugDbSnapshotRelationship {
  return {
    kind: isPresent ? "present" : "missing",
    table: tableName,
    id,
    ...(!isPresent && { reason: `${tableName} row was referenced but not captured` }),
  };
}

function toArray<T>(value: T | null | undefined): T[] {
  return value === null || value === undefined ? [] : [value];
}
