/**
 * Tests for SessionServiceImpl.spawnFromPassage.
 *
 * Covers:
 *   - Happy path: creates a teach session and attaches a session-scoped passage range
 *   - Document not found: throws when documentId is unknown or owned by a different student
 *   - Out-of-bounds range: endOffset > document length — session opens successfully;
 *     the ORIGINAL (unclamped) range is stored in the scope row (clamping applies
 *     only to text extraction, not to the stored range).
 *
 * Each test uses a real SessionServiceImpl with a real (temp) DB, a FakeEngine
 * injected via engineFactory, and a real DocumentScopesServiceImpl wired into
 * toolServices.documentScopes so the scope-attachment path is fully exercised.
 */

import { documentChunks, documents } from "@praxis/artifacts/schema";
import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { inMemorySecretStorage, noopLockService } from "../../../../../tests/helpers/mocks.js";
import { openDb } from "../../db/index.js";
import type { DocumentId, Engine, EngineEvent, StudentId } from "../../types/index.js";
import { brandId } from "../../types/index.js";
import { DocumentScopesServiceImpl } from "../document-scopes-service.js";
import { SessionServiceImpl } from "../session-service.js";
import { getOrCreateDefaultStudentId } from "../student.js";
import type { ServiceDeps } from "../types.js";

const dbCtx = useTempDb();

// ── helpers ────────────────────────────────────────────────────────────────────

function makeLog() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(function (this: ReturnType<typeof makeLog>) {
      return this;
    }),
  };
}

function makeTeachMode() {
  return {
    id: "teach",
    label: "Teach",
    displayName: "teach",
    description: "Open tutoring session.",
    requiredRole: "student" as const,
    uiSurface: "chat" as const,
    toolNames: [],
    promptFragments: [],
  };
}

function makeFakeEngine(opts: { engineEvents?: EngineEvent[] } = {}): Engine {
  const handle = {
    id: "fake-handle",
    send: vi.fn().mockImplementation(async function* () {
      for (const ev of opts.engineEvents ?? []) yield ev;
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    id: "fake-engine",
    kind: "single-shot" as const,
    health: vi.fn().mockResolvedValue({
      ok: true,
      capabilities: {
        vision: false,
        streaming: false,
        nativeMCP: false,
        contextWindow: 4096,
      },
    }),
    open: vi.fn().mockResolvedValue(handle),
  } as unknown as Engine;
}

/**
 * Build a SessionServiceImpl with the real DocumentScopesServiceImpl wired into
 * toolServices.documentScopes. Other toolServices fields are minimally stubbed
 * because spawnFromPassage only calls documentScopes.attach (plus this.start and
 * this.send which go through the engine, not toolServices).
 */
function makeService(db: ReturnType<typeof openDb>["db"]) {
  const log = makeLog();
  const documentScopes = new DocumentScopesServiceImpl({ db, log });
  const fakeEngine = makeFakeEngine();

  const deps: ServiceDeps = {
    db,
    log,
    modes: new Map([["teach", makeTeachMode()]]),
    toolDefinitions: [],
    toolServices: {
      documentScopes,
      // biome-ignore lint/suspicious/noExplicitAny: test stub — spawnFromPassage only uses documentScopes
    } as any,
    lockService: noopLockService(),
    engineFactory: () => fakeEngine,
    secretStorage: inMemorySecretStorage(),
  };

  return {
    svc: new SessionServiceImpl(deps),
    documentScopes,
    log,
  };
}

function insertDocumentWithChunks(
  db: ReturnType<typeof openDb>["db"],
  studentId: string,
  chunks: string[],
): DocumentId {
  const docId = uuidv7();
  db.insert(documents)
    .values({
      id: docId,
      studentId,
      filename: "test-document.pdf",
      mimeType: "application/pdf",
      ingestedAt: new Date(),
      manifestJson: { title: "Test Document", pageCount: 1 } as unknown as Record<string, unknown>,
      chunkCount: chunks.length,
    })
    .run();

  for (let i = 0; i < chunks.length; i++) {
    db.insert(documentChunks)
      .values({
        id: uuidv7(),
        documentId: docId,
        chunkIndex: i,
        text: chunks[i] ?? "",
        locatorJson: { page: 1 } as unknown as Record<string, unknown>,
      })
      .run();
  }

  return brandId<"DocumentId">(docId);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("SessionServiceImpl.spawnFromPassage", () => {
  let db: ReturnType<typeof openDb>["db"];
  let studentId: string;

  beforeEach(() => {
    ({ db } = openDb({ path: dbCtx.dbPath }));
    studentId = getOrCreateDefaultStudentId(db);
  });

  it("creates a teach session and attaches a session-scoped passage range", async () => {
    const docId = insertDocumentWithChunks(db, studentId, ["chunk one text", "chunk two text"]);
    const { svc, documentScopes } = makeService(db);

    const handle = await svc.spawnFromPassage({
      studentId: brandId<"StudentId">(studentId) as StudentId,
      documentId: docId,
      range: { startOffset: 6, endOffset: 9 },
    });

    // Returned handle is a teach session
    expect(handle.modeId).toBe("teach");
    expect(handle.sessionId).toBeTruthy();

    // Document scope row was written with the passage range
    const range = await documentScopes.getPassageRange({
      scope: { kind: "session", id: handle.sessionId },
      documentId: docId,
    });
    expect(range).toEqual({ startOffset: 6, endOffset: 9 });
  });

  it("throws Document not found when documentId is unknown", async () => {
    const { svc } = makeService(db);

    await expect(
      svc.spawnFromPassage({
        studentId: brandId<"StudentId">(studentId) as StudentId,
        documentId: brandId<"DocumentId">(uuidv7()),
        range: { startOffset: 0, endOffset: 5 },
      }),
    ).rejects.toThrow(/Document not found/);
  });

  it("throws Document not found when documentId is owned by a different student", async () => {
    // Insert a document owned by a different student
    const otherStudentId = uuidv7();
    const docId = insertDocumentWithChunks(db, otherStudentId, ["some text here"]);
    const { svc } = makeService(db);

    await expect(
      svc.spawnFromPassage({
        studentId: brandId<"StudentId">(studentId) as StudentId,
        documentId: docId,
        range: { startOffset: 0, endOffset: 5 },
      }),
    ).rejects.toThrow(/Document not found/);
  });

  it("stores the original (unclamped) range even when endOffset exceeds document length", async () => {
    // 30-char document across two chunks (14 + 16 = 30 chars, joined by "\n\n" = 32 total)
    const docId = insertDocumentWithChunks(db, studentId, ["chunk A text xx", "chunk B text xxxx"]);
    const { svc, documentScopes } = makeService(db);

    // endOffset 999 is well beyond document length — session should still open
    const handle = await svc.spawnFromPassage({
      studentId: brandId<"StudentId">(studentId) as StudentId,
      documentId: docId,
      range: { startOffset: 0, endOffset: 999 },
    });

    expect(handle.modeId).toBe("teach");

    // Implementation discovery: spawnFromPassage stores input.range verbatim in the scope row
    // (clamping is applied only to the text extraction for the opening message, not to the
    // stored range). The document viewer receives the original range and is responsible for
    // clamping on display.
    const range = await documentScopes.getPassageRange({
      scope: { kind: "session", id: handle.sessionId },
      documentId: docId,
    });
    expect(range).toEqual({ startOffset: 0, endOffset: 999 });
  });

  it("truncates passage to MAX_PASSAGE_LENGTH (100k) and logs a warn when the clamped range is huge", async () => {
    // Build a document whose full text is >100k chars so the passage-length cap triggers.
    // Each chunk is ~51k chars of 'a'; two chunks joined by "\n\n" = ~102k chars total.
    const bigChunk = "a".repeat(51_000);
    const docId = insertDocumentWithChunks(db, studentId, [bigChunk, bigChunk]);
    const { svc, log } = makeService(db);

    // Request the entire document (startOffset 0, endOffset >> 100k) — passage
    // should be capped at 100k chars and a warn logged.
    const handle = await svc.spawnFromPassage({
      studentId: brandId<"StudentId">(studentId) as StudentId,
      documentId: docId,
      range: { startOffset: 0, endOffset: 200_000 },
    });

    expect(handle.modeId).toBe("teach");
    // The warn should have been emitted for passage truncation.
    expect(log.warn).toHaveBeenCalledWith(
      "spawn_from_passage.passage_truncated",
      expect.objectContaining({ cappedLength: 100_000 }),
    );
  });
});
