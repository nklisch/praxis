import { courses, documents } from "@praxis/artifacts/schema";
import { openDb } from "@praxis/core/db";
import { describe, expect, it } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import type { CourseId, DocumentId, StudentId } from "../../types/index.js";
import { brandId } from "../../types/index.js";
import { CourseDocumentsServiceImpl } from "../course-documents-service.js";

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
  return { service: new CourseDocumentsServiceImpl({ db: drizzle, log: makeLog() }), db: drizzle };
}

const STUDENT_A = brandId<"StudentId">("student-a") as StudentId;
const COURSE_X = brandId<"CourseId">("course-x") as CourseId;
const COURSE_Y = brandId<"CourseId">("course-y") as CourseId;
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

describe("CourseDocumentsServiceImpl", () => {
  describe("attach + listForCourse", () => {
    it("attaches a document and returns it in listForCourse", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);
      insertDocument(drizzle, DOC_1);

      const result = await service.attach({
        courseId: COURSE_X,
        documentId: DOC_1,
        source: "manual",
      });
      expect(result.attached).toBe(true);

      const ids = await service.listForCourse(COURSE_X);
      expect(ids).toContain(DOC_1);
    });

    it("returns empty array when no documents attached", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);

      const ids = await service.listForCourse(COURSE_X);
      expect(ids).toEqual([]);
    });

    it("attach is idempotent — second attach returns attached:false", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);
      insertDocument(drizzle, DOC_1);

      await service.attach({ courseId: COURSE_X, documentId: DOC_1, source: "manual" });
      const second = await service.attach({
        courseId: COURSE_X,
        documentId: DOC_1,
        source: "ingestion",
      });
      expect(second.attached).toBe(false);

      // Still only one entry
      const ids = await service.listForCourse(COURSE_X);
      expect(ids).toHaveLength(1);
    });
  });

  describe("detach", () => {
    it("detaches an attached document, returns detached:true", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);
      insertDocument(drizzle, DOC_1);

      await service.attach({ courseId: COURSE_X, documentId: DOC_1, source: "manual" });
      const result = await service.detach({ courseId: COURSE_X, documentId: DOC_1 });
      expect(result.detached).toBe(true);

      const ids = await service.listForCourse(COURSE_X);
      expect(ids).toHaveLength(0);
    });

    it("detach is idempotent — detaching unattached doc returns detached:false", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);
      insertDocument(drizzle, DOC_1);

      const result = await service.detach({ courseId: COURSE_X, documentId: DOC_1 });
      expect(result.detached).toBe(false);
    });
  });

  describe("listForCourseDetailed", () => {
    it("returns document summary items for attached docs", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);
      insertDocument(drizzle, DOC_1);
      insertDocument(drizzle, DOC_2);

      await service.attach({ courseId: COURSE_X, documentId: DOC_1, source: "manual" });
      await service.attach({ courseId: COURSE_X, documentId: DOC_2, source: "bootstrap" });

      const detailed = await service.listForCourseDetailed(COURSE_X);
      expect(detailed).toHaveLength(2);
      const docIds = detailed.map((d) => d.documentId);
      expect(docIds).toContain(DOC_1);
      expect(docIds).toContain(DOC_2);
      expect(detailed[0]?.chunkCount).toBe(10);
    });

    it("returns empty array for course with no attachments", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);

      const detailed = await service.listForCourseDetailed(COURSE_X);
      expect(detailed).toEqual([]);
    });

    it("does not include docs attached to a different course", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);
      insertCourse(drizzle, COURSE_Y);
      insertDocument(drizzle, DOC_1);
      insertDocument(drizzle, DOC_2);

      await service.attach({ courseId: COURSE_X, documentId: DOC_1, source: "manual" });
      await service.attach({ courseId: COURSE_Y, documentId: DOC_2, source: "manual" });

      const detailedX = await service.listForCourseDetailed(COURSE_X);
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
        courseId: COURSE_X,
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
      await service.attach({ courseId: COURSE_X, documentId: DOC_1, source: "manual" });

      const result = await service.attachMany({
        courseId: COURSE_X,
        documentIds: [DOC_1, DOC_2],
        source: "bootstrap",
      });

      // Only DOC_2 is newly attached
      expect(result.newlyAttached).toHaveLength(1);
      expect(result.newlyAttached).toContain(DOC_2);

      // Both are attached now
      const ids = await service.listForCourse(COURSE_X);
      expect(ids).toHaveLength(2);
    });

    it("returns empty newlyAttached for empty input", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);

      const result = await service.attachMany({
        courseId: COURSE_X,
        documentIds: [],
        source: "manual",
      });
      expect(result.newlyAttached).toEqual([]);
    });
  });

  describe("FK cascade on course delete", () => {
    it("deleting a course removes its course_documents rows", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);
      insertDocument(drizzle, DOC_1);
      await service.attach({ courseId: COURSE_X, documentId: DOC_1, source: "manual" });

      // Delete the course
      drizzle.delete(courses).run();

      // The course_documents rows should be gone (FK cascade)
      const ids = await service.listForCourse(COURSE_X);
      expect(ids).toHaveLength(0);
    });
  });

  describe("FK cascade on document delete", () => {
    it("deleting a document removes its course_documents rows", async () => {
      const { service, db: drizzle } = makeService();
      insertCourse(drizzle, COURSE_X);
      insertDocument(drizzle, DOC_1);
      await service.attach({ courseId: COURSE_X, documentId: DOC_1, source: "manual" });

      // Delete the document
      drizzle.delete(documents).run();

      // The course_documents rows should be gone (FK cascade)
      const ids = await service.listForCourse(COURSE_X);
      expect(ids).toHaveLength(0);
    });
  });
});
