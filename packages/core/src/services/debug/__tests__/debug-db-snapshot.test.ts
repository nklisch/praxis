import { join } from "node:path";
import {
  assignmentResponses,
  assignments,
  courses,
  documentScopes,
  documents,
} from "@praxis/artifacts/schema";
import { episodicEvents, sessions } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTempDb } from "../../../../../../tests/helpers/db-setup.js";
import { openDb, type PraxisDb } from "../../../db/index.js";
import { runMigrations } from "../../../db/migrate.js";
import type { EngineEvent, SessionId } from "../../../types/index.js";
import { type DebugDbSnapshot, DebugDbSnapshotterImpl } from "../debug-db-snapshot.js";

const dbCtx = useTempDb();

describe("DebugDbSnapshotterImpl", () => {
  it("captures session and episodic rows for a session-scoped snapshot", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const sessionId = insertSession(db, "session-snapshot-1");
    insertEvent(db, sessionId, "event-1", { type: "user_message", content: "hello" });

    const snapshot = await new DebugDbSnapshotterImpl(db).capture({ sessionId });

    expect(tableRows(snapshot, "sessions")).toEqual([
      expect.objectContaining({ id: sessionId, modeId: "course-create" }),
    ]);
    expect(tableRows(snapshot, "episodic_events")).toEqual([
      expect.objectContaining({
        id: "event-1",
        sessionId,
        eventJson: expect.objectContaining({ type: "user_message", content: "hello" }),
      }),
    ]);
  });

  it("resolves a focused session snapshot from callIds", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const targetSessionId = insertSession(db, "session-call-snapshot");
    const unrelatedSessionId = insertSession(db, "session-call-snapshot-unrelated");
    insertEvent(db, targetSessionId, "event-call-snapshot-user", {
      type: "user_message",
      content: "start",
    });
    insertEvent(db, targetSessionId, "event-call-snapshot-tool", {
      type: "tool_call",
      toolName: "course.start_drafting",
      args: { title: "Pathophysiology" },
      callId: "call-snapshot",
    });
    insertEvent(db, unrelatedSessionId, "event-call-snapshot-unrelated", {
      type: "user_message",
      content: "ignore",
    });

    const snapshot = await new DebugDbSnapshotterImpl(db).capture({
      callIds: ["call-snapshot"],
    });

    expect(tableRows(snapshot, "sessions")).toEqual([
      expect.objectContaining({ id: targetSessionId }),
    ]);
    expect(tableRows(snapshot, "episodic_events")).toEqual([
      expect.objectContaining({ id: "event-call-snapshot-user", sessionId: targetSessionId }),
      expect.objectContaining({ id: "event-call-snapshot-tool", sessionId: targetSessionId }),
    ]);
  });

  it("captures document scope relationships and summarizes omitted document chunks", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const sessionId = insertSession(db, "session-doc-scope");
    insertDocument(db, "doc-1", 3);
    db.insert(documentScopes)
      .values({
        documentId: "doc-1",
        scopeKind: "session",
        scopeId: sessionId,
        attachedAt: new Date("2026-06-01T00:00:00.000Z"),
        source: "course-create",
      })
      .run();

    const snapshot = await new DebugDbSnapshotterImpl(db).capture({ sessionId });

    expect(tableRows(snapshot, "documents")).toEqual([
      expect.objectContaining({ id: "doc-1", chunkCount: 3 }),
    ]);
    expect(tableRows(snapshot, "document_scopes")).toEqual([
      expect.objectContaining({ documentId: "doc-1", scopeKind: "session", scopeId: sessionId }),
    ]);
    expect(snapshot.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "present", table: "documents", id: "doc-1" }),
        expect.objectContaining({ kind: "present", table: "sessions", id: sessionId }),
        expect.objectContaining({
          kind: "present",
          table: "document_chunks",
          id: "doc-1",
          reason: expect.stringContaining("omitted 3 document chunk rows"),
        }),
      ]),
    );
  });

  it("restores rows into a temp DB in FK-safe order", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    insertCourse(db, "course-1");
    insertAssignment(db, "assignment-1", "course-1");
    const sessionId = insertSession(db, "session-restore", {
      courseId: "course-1",
      assignmentId: "assignment-1",
    });
    insertEvent(db, sessionId, "event-restore", { type: "user_message", content: "restore me" });
    db.insert(assignmentResponses)
      .values({
        assignmentId: "assignment-1",
        itemId: "item-1",
        response: "42",
        recordedAt: new Date("2026-06-01T00:00:03.000Z"),
      })
      .run();
    insertDocument(db, "doc-restore", 1);
    db.insert(documentScopes)
      .values({
        documentId: "doc-restore",
        scopeKind: "course",
        scopeId: "course-1",
        attachedAt: new Date("2026-06-01T00:00:04.000Z"),
        source: "course-create",
      })
      .run();

    const snapshotter = new DebugDbSnapshotterImpl(db);
    const snapshot = await snapshotter.capture({ sessionId });
    const restorePath = join(dbCtx.tmpDir, "restore.db");
    runMigrations({ path: restorePath, migrationsFolder: join(process.cwd(), "drizzle") });
    const restored = openDb({ path: restorePath });
    try {
      await snapshotter.restore({ snapshot, db: restored.db });

      expect(
        restored.db.select().from(courses).where(eq(courses.id, "course-1")).all(),
      ).toHaveLength(1);
      expect(
        restored.db.select().from(assignments).where(eq(assignments.id, "assignment-1")).all(),
      ).toHaveLength(1);
      expect(
        restored.db.select().from(sessions).where(eq(sessions.id, sessionId)).all(),
      ).toHaveLength(1);
      expect(
        restored.db
          .select()
          .from(episodicEvents)
          .where(eq(episodicEvents.id, "event-restore"))
          .all(),
      ).toHaveLength(1);
      expect(
        restored.db
          .select()
          .from(documentScopes)
          .where(eq(documentScopes.documentId, "doc-restore"))
          .all(),
      ).toHaveLength(1);
      expect(
        restored.db
          .select()
          .from(assignmentResponses)
          .where(eq(assignmentResponses.assignmentId, "assignment-1"))
          .all(),
      ).toHaveLength(1);
    } finally {
      restored.sqlite.close();
    }
  });
});

function tableRows(snapshot: DebugDbSnapshot, name: string): readonly Record<string, unknown>[] {
  return snapshot.tables.find((table) => table.name === name)?.rows ?? [];
}

function insertCourse(db: PraxisDb, id: string): void {
  db.insert(courses)
    .values({
      id,
      studentId: "student-1",
      title: "Pathophysiology",
      subject: "health.nursing",
      gradeLevel: "Nursing",
      sourceJson: { kind: "manual" },
      conceptGraphId: "graph-1",
      thresholdsJson: {},
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    })
    .run();
}

function insertAssignment(db: PraxisDb, id: string, courseId: string): void {
  db.insert(assignments)
    .values({
      id,
      courseId,
      kind: "quiz",
      title: "Quiz",
      itemsJson: [],
      conceptIdsJson: [],
      assignedAt: new Date("2026-06-01T00:00:01.000Z"),
    })
    .run();
}

function insertSession(
  db: PraxisDb,
  id: string,
  opts: { courseId?: string; assignmentId?: string } = {},
): SessionId {
  db.insert(sessions)
    .values({
      id,
      studentId: "student-1",
      modeId: "course-create",
      engineId: "fake-engine",
      startedAt: new Date("2026-06-01T00:00:02.000Z"),
      ...(opts.courseId !== undefined && { courseId: opts.courseId }),
      ...(opts.assignmentId !== undefined && { assignmentId: opts.assignmentId }),
    })
    .run();
  return id as SessionId;
}

function insertEvent(db: PraxisDb, sessionId: SessionId, id: string, event: EngineEvent): void {
  db.insert(episodicEvents)
    .values({
      id,
      sessionId,
      studentId: "student-1",
      ts: new Date("2026-06-01T00:00:03.000Z"),
      engineId: "fake-engine",
      modeId: "course-create",
      turnIndex: 0,
      eventJson: event,
    })
    .run();
}

function insertDocument(db: PraxisDb, id: string, chunkCount: number): void {
  db.insert(documents)
    .values({
      id,
      studentId: "student-1",
      filename: `${id}.pdf`,
      mimeType: "application/pdf",
      ingestedAt: new Date("2026-06-01T00:00:00.000Z"),
      manifestJson: {},
      chunkCount,
    })
    .run();
}
