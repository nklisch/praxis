/**
 * Unit tests for CitationsServiceImpl.
 *
 * Covers:
 *   - record() inserts and returns the full citation
 *   - record() with optional fields (citingTurnId, citedText)
 *   - listByDocument() returns rows in startOffset order
 *   - listByDocument() returns [] for unknown document
 *   - FK cascade: deleting a document removes its citation rows
 */

import { documentCitations, documents } from "@praxis/artifacts/schema";
import { openDb } from "@praxis/core/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import type { DocumentId, SessionId, StudentId } from "../../types/index.js";
import { brandId } from "../../types/index.js";
import { CitationsServiceImpl } from "../citations-service.js";

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
    service: new CitationsServiceImpl({ db: drizzle, log: makeLog() }),
    db: drizzle,
  };
}

const STUDENT_A = brandId<"StudentId">("student-a") as StudentId;
const DOC_1 = brandId<"DocumentId">("doc-1") as DocumentId;
const DOC_2 = brandId<"DocumentId">("doc-2") as DocumentId;
const SESSION_A = brandId<"SessionId">("session-a") as SessionId;
const SESSION_B = brandId<"SessionId">("session-b") as SessionId;

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
      manifestJson: { title: `Title for ${documentId}`, pageCount: 10 } as unknown as Record<
        string,
        unknown
      >,
      chunkCount: 3,
    })
    .run();
}

describe("CitationsServiceImpl", () => {
  describe("record()", () => {
    it("inserts a citation and returns the full record", async () => {
      const { service, db: drizzle } = makeService();
      insertDocument(drizzle, DOC_1);

      const result = await service.record({
        documentId: DOC_1,
        citingSessionId: SESSION_A,
        startOffset: 10,
        endOffset: 50,
      });

      expect(result.id).toBeTruthy();
      expect(result.documentId).toBe(DOC_1);
      expect(result.citingSessionId).toBe(SESSION_A);
      expect(result.citingTurnId).toBeNull();
      expect(result.startOffset).toBe(10);
      expect(result.endOffset).toBe(50);
      expect(result.citedText).toBeNull();
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it("stores citingTurnId and citedText when provided", async () => {
      const { service, db: drizzle } = makeService();
      insertDocument(drizzle, DOC_1);

      const result = await service.record({
        documentId: DOC_1,
        citingSessionId: SESSION_A,
        citingTurnId: "turn-abc",
        startOffset: 0,
        endOffset: 30,
        citedText: "Hello world snippet",
      });

      expect(result.citingTurnId).toBe("turn-abc");
      expect(result.citedText).toBe("Hello world snippet");
    });

    it("allows multiple citations for the same document", async () => {
      const { service, db: drizzle } = makeService();
      insertDocument(drizzle, DOC_1);

      await service.record({ documentId: DOC_1, citingSessionId: SESSION_A, startOffset: 0, endOffset: 10 });
      await service.record({ documentId: DOC_1, citingSessionId: SESSION_A, startOffset: 20, endOffset: 40 });
      await service.record({ documentId: DOC_1, citingSessionId: SESSION_B, startOffset: 5, endOffset: 15 });

      const rows = drizzle.select().from(documentCitations).where(eq(documentCitations.documentId, DOC_1)).all();
      expect(rows).toHaveLength(3);
    });

    it("persists the row to the database (round-trip via DB select)", async () => {
      const { service, db: drizzle } = makeService();
      insertDocument(drizzle, DOC_1);

      const { id } = await service.record({
        documentId: DOC_1,
        citingSessionId: SESSION_A,
        startOffset: 100,
        endOffset: 200,
      });

      const row = drizzle
        .select()
        .from(documentCitations)
        .where(eq(documentCitations.id, id))
        .get();

      expect(row).toBeDefined();
      expect(row!.startOffset).toBe(100);
      expect(row!.endOffset).toBe(200);
    });
  });

  describe("listByDocument()", () => {
    it("returns all citations for a document in startOffset order", async () => {
      const { service, db: drizzle } = makeService();
      insertDocument(drizzle, DOC_1);

      // Insert in reverse order to confirm sorting.
      await service.record({ documentId: DOC_1, citingSessionId: SESSION_A, startOffset: 80, endOffset: 100 });
      await service.record({ documentId: DOC_1, citingSessionId: SESSION_A, startOffset: 10, endOffset: 20 });
      await service.record({ documentId: DOC_1, citingSessionId: SESSION_B, startOffset: 40, endOffset: 60 });

      const results = await service.listByDocument(DOC_1);

      expect(results).toHaveLength(3);
      expect(results[0]!.startOffset).toBe(10);
      expect(results[1]!.startOffset).toBe(40);
      expect(results[2]!.startOffset).toBe(80);
    });

    it("returns an empty array for a document with no citations", async () => {
      const { service, db: drizzle } = makeService();
      insertDocument(drizzle, DOC_1);

      const results = await service.listByDocument(DOC_1);
      expect(results).toEqual([]);
    });

    it("returns an empty array for an unknown documentId", async () => {
      const { service } = makeService();
      const results = await service.listByDocument(brandId<"DocumentId">("ghost") as DocumentId);
      expect(results).toEqual([]);
    });

    it("does not return citations from a different document", async () => {
      const { service, db: drizzle } = makeService();
      insertDocument(drizzle, DOC_1);
      insertDocument(drizzle, DOC_2);

      await service.record({ documentId: DOC_1, citingSessionId: SESSION_A, startOffset: 0, endOffset: 10 });
      await service.record({ documentId: DOC_2, citingSessionId: SESSION_A, startOffset: 5, endOffset: 15 });

      const resultsDoc1 = await service.listByDocument(DOC_1);
      const resultsDoc2 = await service.listByDocument(DOC_2);

      expect(resultsDoc1).toHaveLength(1);
      expect(resultsDoc1[0]!.documentId).toBe(DOC_1);
      expect(resultsDoc2).toHaveLength(1);
      expect(resultsDoc2[0]!.documentId).toBe(DOC_2);
    });

    it("returns correct field shapes including branded ids", async () => {
      const { service, db: drizzle } = makeService();
      insertDocument(drizzle, DOC_1);

      await service.record({
        documentId: DOC_1,
        citingSessionId: SESSION_A,
        citingTurnId: "t-1",
        startOffset: 5,
        endOffset: 25,
        citedText: "some snippet",
      });

      const [record] = await service.listByDocument(DOC_1);
      expect(record).toBeDefined();
      expect(record!.documentId).toBe(DOC_1);
      expect(record!.citingSessionId).toBe(SESSION_A);
      expect(record!.citingTurnId).toBe("t-1");
      expect(record!.citedText).toBe("some snippet");
      expect(record!.createdAt).toBeInstanceOf(Date);
    });
  });

  describe("FK cascade", () => {
    it("deleting a document removes its citation rows", async () => {
      const { service, db: drizzle } = makeService();
      insertDocument(drizzle, DOC_1);

      await service.record({ documentId: DOC_1, citingSessionId: SESSION_A, startOffset: 0, endOffset: 10 });
      await service.record({ documentId: DOC_1, citingSessionId: SESSION_B, startOffset: 20, endOffset: 30 });

      // Verify rows exist.
      expect(await service.listByDocument(DOC_1)).toHaveLength(2);

      // Delete the document.
      drizzle.delete(documents).where(eq(documents.id, DOC_1)).run();

      // Citations should be gone.
      const rows = drizzle.select().from(documentCitations).where(eq(documentCitations.documentId, DOC_1)).all();
      expect(rows).toHaveLength(0);
    });
  });
});
