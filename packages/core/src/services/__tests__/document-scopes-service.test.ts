import { courses, documents } from "@praxis/artifacts/schema";
import { openDb } from "@praxis/core/db";
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
        source: "bootstrap",
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
        source: "bootstrap",
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
        source: "bootstrap",
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
        source: "bootstrap",
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
      expect(sources).toContain("bootstrap");
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
        source: "bootstrap",
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
        source: "bootstrap",
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
        source: "bootstrap",
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
        source: "bootstrap",
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
        source: "bootstrap",
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
        source: "bootstrap",
      });

      const result = await service.promoteScope({
        from: { kind: "session", id: SESSION_A },
        to: { kind: "course", id: COURSE_X },
        source: "bootstrap",
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
        source: "bootstrap",
      });

      await service.promoteScope({
        from: { kind: "session", id: SESSION_A },
        to: { kind: "course", id: COURSE_X },
        source: "bootstrap",
      });

      // Second promote — DOC_1 already in the course scope
      const second = await service.promoteScope({
        from: { kind: "session", id: SESSION_A },
        to: { kind: "course", id: COURSE_X },
        source: "bootstrap",
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
        source: "bootstrap",
      });
      expect(result.promoted).toHaveLength(0);
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
