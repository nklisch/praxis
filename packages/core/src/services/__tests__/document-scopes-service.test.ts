import { courses, documents } from "@praxis/artifacts/schema";
import { openDb } from "@praxis/core/db";
import { sessions } from "@praxis/memory/schema";
import { describe, expect, it } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import type { CourseId, DocumentId, SessionId, StudentId } from "../../types/index.js";
import { brandId } from "../../types/index.js";
import { DocumentScopesServiceImpl } from "../document-scopes-service.js";

const db = useTempDb();

function makeLog() {
  const log = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    child: () => log,
  };
  return log;
}

function makeService() {
  const { db: drizzle } = openDb({ path: db.dbPath });
  return {
    service: new DocumentScopesServiceImpl({ db: drizzle, log: makeLog() }),
    db: drizzle,
  };
}

const STUDENT_A = brandId<"StudentId">("student-a") as StudentId;
const COURSE_X = brandId<"CourseId">("course-x") as CourseId;
const COURSE_Y = brandId<"CourseId">("course-y") as CourseId;
const SESSION_A = brandId<"SessionId">("session-a") as SessionId;
const DOC_1 = brandId<"DocumentId">("doc-1") as DocumentId;
const DOC_2 = brandId<"DocumentId">("doc-2") as DocumentId;
const DOC_3 = brandId<"DocumentId">("doc-3") as DocumentId;

function insertCourse(drizzle: ReturnType<typeof openDb>["db"], courseId: CourseId) {
  drizzle
    .insert(courses)
    .values({
      id: courseId,
      studentId: STUDENT_A,
      title: `Course ${courseId}`,
      subject: "math",
      gradeLevel: "high-school",
      sourceJson: { kind: "extracted" } as unknown as Record<string, unknown>,
      conceptGraphId: `graph-${courseId}`,
      thresholdsJson: {
        conceptMastery: 0.7,
        examPass: 0.7,
        allowRetake: true,
        decayDays: 14,
      } as unknown as Record<string, unknown>,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
}

function insertSession(
  drizzle: ReturnType<typeof openDb>["db"],
  sessionId: SessionId,
  studentId: StudentId = STUDENT_A,
) {
  drizzle
    .insert(sessions)
    .values({
      id: sessionId,
      studentId,
      modeId: "course-create",
      engineId: "claude-code",
      startedAt: new Date(),
    })
    .run();
}

function insertDocument(
  drizzle: ReturnType<typeof openDb>["db"],
  documentId: DocumentId,
  studentId: StudentId = STUDENT_A,
) {
  drizzle
    .insert(documents)
    .values({
      id: documentId,
      studentId,
      filename: `${documentId}.pdf`,
      mimeType: "application/pdf",
      ingestedAt: new Date(),
      manifestJson: { title: `Title for ${documentId}`, pageCount: 100 } as unknown as Record<
        string,
        unknown
      >,
      chunkCount: 10,
    })
    .run();
}

describe("DocumentScopesServiceImpl", () => {
  describe("attach + listForScope", () => {
    it("attaches a document to a course scope and lists it", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);
      insertDocument(drizzle, DOC_1);

      const result = await service.attach({
        scope: { kind: "course", id: COURSE_X },
        documentId: DOC_1,
        source: "manual",
      });
      expect(result.attached).toBe(true);

      const ids = await service.listForScope({ kind: "course", id: COURSE_X });
      expect(ids).toContain(DOC_1);
    });

    it("attaches a document to a session scope and lists it", async () => {
      const { service, db: drizzle } = makeService();
      insertDocument(drizzle, DOC_1);

      const result = await service.attach({
        scope: { kind: "session", id: SESSION_A },
        documentId: DOC_1,
        source: "course-create",
      });
      expect(result.attached).toBe(true);

      const ids = await service.listForScope({ kind: "session", id: SESSION_A });
      expect(ids).toContain(DOC_1);
    });

    it("returns empty array when no documents attached to scope", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);

      const ids = await service.listForScope({ kind: "course", id: COURSE_X });
      expect(ids).toEqual([]);
    });

    it("is idempotent — re-attaching returns attached:false", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);
      insertDocument(drizzle, DOC_1);

      await service.attach({
        scope: { kind: "course", id: COURSE_X },
        documentId: DOC_1,
        source: "manual",
      });
      const second = await service.attach({
        scope: { kind: "course", id: COURSE_X },
        documentId: DOC_1,
        source: "ingestion",
      });
      expect(second.attached).toBe(false);

      // Still only one entry
      const ids = await service.listForScope({ kind: "course", id: COURSE_X });
      expect(ids).toHaveLength(1);
    });

    it("allows the same document in multiple scopes simultaneously", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);
      insertDocument(drizzle, DOC_1);

      await service.attach({
        scope: { kind: "course", id: COURSE_X },
        documentId: DOC_1,
        source: "manual",
      });
      await service.attach({
        scope: { kind: "session", id: SESSION_A },
        documentId: DOC_1,
        source: "course-create",
      });

      const courseIds = await service.listForScope({ kind: "course", id: COURSE_X });
      const sessionIds = await service.listForScope({ kind: "session", id: SESSION_A });
      expect(courseIds).toContain(DOC_1);
      expect(sessionIds).toContain(DOC_1);
    });

    it("does not include docs attached to a different scope", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);
      insertCourse(drizzle, COURSE_Y);
      insertDocument(drizzle, DOC_1);
      insertDocument(drizzle, DOC_2);

      await service.attach({
        scope: { kind: "course", id: COURSE_X },
        documentId: DOC_1,
        source: "manual",
      });
      await service.attach({
        scope: { kind: "course", id: COURSE_Y },
        documentId: DOC_2,
        source: "manual",
      });

      const idsX = await service.listForScope({ kind: "course", id: COURSE_X });
      expect(idsX).toEqual([DOC_1]);
    });
  });

  describe("detach", () => {
    it("detaches an attached document, returns detached:true", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);
      insertDocument(drizzle, DOC_1);

      await service.attach({
        scope: { kind: "course", id: COURSE_X },
        documentId: DOC_1,
        source: "manual",
      });
      const result = await service.detach({
        scope: { kind: "course", id: COURSE_X },
        documentId: DOC_1,
      });
      expect(result.detached).toBe(true);

      const ids = await service.listForScope({ kind: "course", id: COURSE_X });
      expect(ids).toHaveLength(0);
    });

    it("is idempotent — detaching unattached doc returns detached:false", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);
      insertDocument(drizzle, DOC_1);

      const result = await service.detach({
        scope: { kind: "course", id: COURSE_X },
        documentId: DOC_1,
      });
      expect(result.detached).toBe(false);
    });

    it("detaching from one scope leaves the other intact", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);
      insertDocument(drizzle, DOC_1);

      await service.attach({
        scope: { kind: "course", id: COURSE_X },
        documentId: DOC_1,
        source: "manual",
      });
      await service.attach({
        scope: { kind: "session", id: SESSION_A },
        documentId: DOC_1,
        source: "course-create",
      });

      await service.detach({
        scope: { kind: "course", id: COURSE_X },
        documentId: DOC_1,
      });

      const courseIds = await service.listForScope({ kind: "course", id: COURSE_X });
      const sessionIds = await service.listForScope({ kind: "session", id: SESSION_A });
      expect(courseIds).toHaveLength(0);
      expect(sessionIds).toContain(DOC_1);
    });
  });

  describe("listForScopeDetailed", () => {
    it("returns document scope attachments with source and attachedAt", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);
      insertDocument(drizzle, DOC_1);
      insertDocument(drizzle, DOC_2);

      await service.attach({
        scope: { kind: "course", id: COURSE_X },
        documentId: DOC_1,
        source: "manual",
      });
      await service.attach({
        scope: { kind: "course", id: COURSE_X },
        documentId: DOC_2,
        source: "course-create",
      });

      const detailed = await service.listForScopeDetailed({ kind: "course", id: COURSE_X });
      expect(detailed).toHaveLength(2);
      const docIds = detailed.map((d) => d.documentId);
      expect(docIds).toContain(DOC_1);
      expect(docIds).toContain(DOC_2);
      expect(detailed[0]?.chunkCount).toBe(10);
      expect(detailed[0]?.attachedAt).toBeInstanceOf(Date);
      // source field is present
      const sources = detailed.map((d) => d.source);
      expect(sources).toContain("manual");
      expect(sources).toContain("course-create");
    });

    it("returns empty array for scope with no attachments", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);

      const detailed = await service.listForScopeDetailed({ kind: "course", id: COURSE_X });
      expect(detailed).toEqual([]);
    });

    it("does not include docs attached to a different scope", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);
      insertCourse(drizzle, COURSE_Y);
      insertDocument(drizzle, DOC_1);
      insertDocument(drizzle, DOC_2);

      await service.attach({
        scope: { kind: "course", id: COURSE_X },
        documentId: DOC_1,
        source: "manual",
      });
      await service.attach({
        scope: { kind: "course", id: COURSE_Y },
        documentId: DOC_2,
        source: "manual",
      });

      const detailedX = await service.listForScopeDetailed({ kind: "course", id: COURSE_X });
      expect(detailedX.map((d) => d.documentId)).toEqual([DOC_1]);
    });
  });

  describe("attachMany", () => {
    it("attaches multiple documents and returns newly attached ids", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);
      insertDocument(drizzle, DOC_1);
      insertDocument(drizzle, DOC_2);
      insertDocument(drizzle, DOC_3);

      const result = await service.attachMany({
        scope: { kind: "course", id: COURSE_X },
        documentIds: [DOC_1, DOC_2, DOC_3],
        source: "course-create",
      });
      expect(result.newlyAttached).toHaveLength(3);
      expect(result.newlyAttached).toContain(DOC_1);
      expect(result.newlyAttached).toContain(DOC_2);
      expect(result.newlyAttached).toContain(DOC_3);
    });

    it("skips already-attached documents", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);
      insertDocument(drizzle, DOC_1);
      insertDocument(drizzle, DOC_2);

      // Pre-attach DOC_1
      await service.attach({
        scope: { kind: "course", id: COURSE_X },
        documentId: DOC_1,
        source: "manual",
      });

      const result = await service.attachMany({
        scope: { kind: "course", id: COURSE_X },
        documentIds: [DOC_1, DOC_2],
        source: "course-create",
      });

      // Only DOC_2 is newly attached
      expect(result.newlyAttached).toHaveLength(1);
      expect(result.newlyAttached).toContain(DOC_2);

      // Both are attached now
      const ids = await service.listForScope({ kind: "course", id: COURSE_X });
      expect(ids).toHaveLength(2);
    });

    it("returns empty newlyAttached for empty input", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);

      const result = await service.attachMany({
        scope: { kind: "course", id: COURSE_X },
        documentIds: [],
        source: "manual",
      });
      expect(result.newlyAttached).toEqual([]);
    });

    it("works with session scope", async () => {
      const { service, db: drizzle } = makeService();
      insertDocument(drizzle, DOC_1);
      insertDocument(drizzle, DOC_2);

      const result = await service.attachMany({
        scope: { kind: "session", id: SESSION_A },
        documentIds: [DOC_1, DOC_2],
        source: "course-create",
      });
      expect(result.newlyAttached).toHaveLength(2);

      const ids = await service.listForScope({ kind: "session", id: SESSION_A });
      expect(ids).toHaveLength(2);
    });
  });

  describe("listScopesForDocument", () => {
    it("returns empty array for an unattached doc", async () => {
      const { service, db: drizzle } = makeService();
      insertDocument(drizzle, DOC_1);

      const scopes = await service.listScopesForDocument(DOC_1);
      expect(scopes).toEqual([]);
    });

    it("returns all scopes for a multi-scoped document", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);
      insertDocument(drizzle, DOC_1);

      await service.attach({
        scope: { kind: "course", id: COURSE_X },
        documentId: DOC_1,
        source: "manual",
      });
      await service.attach({
        scope: { kind: "session", id: SESSION_A },
        documentId: DOC_1,
        source: "course-create",
      });

      const scopes = await service.listScopesForDocument(DOC_1);
      expect(scopes).toHaveLength(2);

      const courseScope = scopes.find((s) => s.kind === "course");
      const sessionScope = scopes.find((s) => s.kind === "session");
      expect(courseScope?.id).toBe(COURSE_X);
      expect(sessionScope?.id).toBe(SESSION_A);
    });

    it("returns only the scopes for the queried document, not others", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);
      insertDocument(drizzle, DOC_1);
      insertDocument(drizzle, DOC_2);

      await service.attach({
        scope: { kind: "course", id: COURSE_X },
        documentId: DOC_1,
        source: "manual",
      });
      await service.attach({
        scope: { kind: "session", id: SESSION_A },
        documentId: DOC_2,
        source: "course-create",
      });

      const scopesDoc1 = await service.listScopesForDocument(DOC_1);
      expect(scopesDoc1).toHaveLength(1);
      expect(scopesDoc1[0]?.kind).toBe("course");
    });
  });

  describe("promoteScope", () => {
    it("copies all docs from one scope to another", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);
      insertDocument(drizzle, DOC_1);
      insertDocument(drizzle, DOC_2);

      await service.attachMany({
        scope: { kind: "session", id: SESSION_A },
        documentIds: [DOC_1, DOC_2],
        source: "course-create",
      });

      const result = await service.promoteScope({
        from: { kind: "session", id: SESSION_A },
        to: { kind: "course", id: COURSE_X },
        source: "course-create",
      });
      expect(result.promoted).toHaveLength(2);
      expect(result.promoted).toContain(DOC_1);
      expect(result.promoted).toContain(DOC_2);

      // Both scopes survive (source rows not deleted)
      const fromIds = await service.listForScope({ kind: "session", id: SESSION_A });
      const toIds = await service.listForScope({ kind: "course", id: COURSE_X });
      expect(fromIds).toHaveLength(2);
      expect(toIds).toHaveLength(2);
    });

    it("is idempotent on re-promote — returns empty promoted on second call", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);
      insertDocument(drizzle, DOC_1);

      await service.attach({
        scope: { kind: "session", id: SESSION_A },
        documentId: DOC_1,
        source: "course-create",
      });

      await service.promoteScope({
        from: { kind: "session", id: SESSION_A },
        to: { kind: "course", id: COURSE_X },
        source: "course-create",
      });

      // Second promote — DOC_1 already in the course scope
      const second = await service.promoteScope({
        from: { kind: "session", id: SESSION_A },
        to: { kind: "course", id: COURSE_X },
        source: "course-create",
      });
      expect(second.promoted).toHaveLength(0);

      // Still exactly one row in each scope
      const fromIds = await service.listForScope({ kind: "session", id: SESSION_A });
      const toIds = await service.listForScope({ kind: "course", id: COURSE_X });
      expect(fromIds).toHaveLength(1);
      expect(toIds).toHaveLength(1);
    });

    it("returns empty promoted when source scope has no documents", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);

      const result = await service.promoteScope({
        from: { kind: "session", id: SESSION_A },
        to: { kind: "course", id: COURSE_X },
        source: "course-create",
      });
      expect(result.promoted).toHaveLength(0);
    });
  });

  describe("listOrphaned", () => {
    it("returns a document with zero scope rows (truly orphaned)", async () => {
      const { service, db: drizzle } = makeService();
      insertDocument(drizzle, DOC_1);

      const orphaned = await service.listOrphaned(STUDENT_A);
      expect(orphaned).toHaveLength(1);
      expect(orphaned[0]?.documentId).toBe(DOC_1);
      expect(orphaned[0]?.source).toBe("ingestion");
    });

    it("returns a document whose only scope row points at a deleted course", async () => {
      const { service, db: drizzle } = makeService();
      insertDocument(drizzle, DOC_1);

      // Attach to a course that doesn't exist (no FK constraint on scope_id)
      await service.attach({
        scope: { kind: "course", id: brandId<"CourseId">("ghost-course") as CourseId },
        documentId: DOC_1,
        source: "course-create",
      });

      const orphaned = await service.listOrphaned(STUDENT_A);
      expect(orphaned).toHaveLength(1);
      expect(orphaned[0]?.documentId).toBe(DOC_1);
      // Source comes from the dangling scope row
      expect(orphaned[0]?.source).toBe("course-create");
    });

    it("returns a document whose only scope row points at a deleted session", async () => {
      const { service, db: drizzle } = makeService();
      insertDocument(drizzle, DOC_1);

      // Attach to a session that doesn't exist
      await service.attach({
        scope: { kind: "session", id: brandId<"SessionId">("ghost-session") as SessionId },
        documentId: DOC_1,
        source: "manual",
      });

      const orphaned = await service.listOrphaned(STUDENT_A);
      expect(orphaned).toHaveLength(1);
      expect(orphaned[0]?.documentId).toBe(DOC_1);
      expect(orphaned[0]?.source).toBe("manual");
    });

    it("does NOT return a document attached to a live course", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);
      insertDocument(drizzle, DOC_1);

      await service.attach({
        scope: { kind: "course", id: COURSE_X },
        documentId: DOC_1,
        source: "manual",
      });

      const orphaned = await service.listOrphaned(STUDENT_A);
      expect(orphaned).toHaveLength(0);
    });

    it("does NOT return a document attached to a live session", async () => {
      const { service, db: drizzle } = makeService();
      insertSession(drizzle, SESSION_A);
      insertDocument(drizzle, DOC_1);

      await service.attach({
        scope: { kind: "session", id: SESSION_A },
        documentId: DOC_1,
        source: "course-create",
      });

      const orphaned = await service.listOrphaned(STUDENT_A);
      expect(orphaned).toHaveLength(0);
    });

    it("does NOT return a document with one dangling AND one live scope row (partial live)", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);
      insertDocument(drizzle, DOC_1);

      // One dangling scope row
      await service.attach({
        scope: { kind: "session", id: brandId<"SessionId">("ghost-session") as SessionId },
        documentId: DOC_1,
        source: "course-create",
      });
      // One live scope row
      await service.attach({
        scope: { kind: "course", id: COURSE_X },
        documentId: DOC_1,
        source: "manual",
      });

      const orphaned = await service.listOrphaned(STUDENT_A);
      expect(orphaned).toHaveLength(0);
    });

    it("returns only docs owned by the given student", async () => {
      const STUDENT_B = brandId<"StudentId">("student-b") as StudentId;
      const { service, db: drizzle } = makeService();
      insertDocument(drizzle, DOC_1, STUDENT_A);
      insertDocument(drizzle, DOC_2, STUDENT_B);

      const orphanedA = await service.listOrphaned(STUDENT_A);
      const orphanedB = await service.listOrphaned(STUDENT_B);

      expect(orphanedA.map((d) => d.documentId)).toEqual([DOC_1]);
      expect(orphanedB.map((d) => d.documentId)).toEqual([DOC_2]);
    });

    it("returns all fields needed for library rendering", async () => {
      const { service, db: drizzle } = makeService();
      insertDocument(drizzle, DOC_1);

      const orphaned = await service.listOrphaned(STUDENT_A);
      const doc = orphaned[0];
      expect(doc).toBeDefined();
      expect(doc!.filename).toBe(`${DOC_1}.pdf`);
      expect(doc!.mimeType).toBe("application/pdf");
      expect(doc!.chunkCount).toBe(10);
      expect(typeof doc!.hasPageImages).toBe("boolean");
      expect(doc!.attachedAt).toBeInstanceOf(Date);
    });
  });

  describe("FK cascade on document delete", () => {
    it("deleting a document removes its document_scopes rows", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);
      insertDocument(drizzle, DOC_1);

      await service.attach({
        scope: { kind: "course", id: COURSE_X },
        documentId: DOC_1,
        source: "manual",
      });

      // Delete the document — FK cascade should remove document_scopes rows
      drizzle.delete(documents).run();

      const ids = await service.listForScope({ kind: "course", id: COURSE_X });
      expect(ids).toHaveLength(0);
    });
  });
});
