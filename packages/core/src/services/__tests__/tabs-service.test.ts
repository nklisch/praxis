import { openDb } from "@praxis/core/db";
import { sessions } from "@praxis/memory/schema";
import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import type { DocumentId, SessionId, StudentId, Timestamp } from "../../types/index.js";
import { brandId } from "../../types/index.js";
import type {
  SessionPromotionRegistry,
  UnpromotedSessionState,
} from "../session/session-promotion-registry.js";
import { generateTitle, TabsServiceImpl } from "../tabs-service.js";

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
  return { service: new TabsServiceImpl({ db: drizzle, log: makeLog() }), db: drizzle };
}

function makeStudentId(suffix = "a") {
  return brandId<"StudentId">(`student-${suffix}`) as StudentId;
}

/** Insert a minimal session row and return its id as SessionId. */
function insertSession(
  drizzle: ReturnType<typeof openDb>["db"],
  opts: { studentId: StudentId; modeId?: string; courseId?: string },
): SessionId {
  const id = uuidv7();
  drizzle
    .insert(sessions)
    .values({
      id,
      studentId: opts.studentId,
      modeId: opts.modeId ?? "teach",
      engineId: "direct.anthropic",
      startedAt: new Date(),
      ...(opts.courseId !== undefined && { courseId: opts.courseId }),
    })
    .run();
  return brandId<"SessionId">(id);
}

describe("generateTitle", () => {
  it("teaches with no course → teach · new chat", () => {
    expect(generateTitle({ modeId: "teach" })).toBe("teach · new chat");
  });

  it("bootstrap with no course → course design · new course", () => {
    expect(generateTitle({ modeId: "course-create" })).toBe("course design · new course");
  });

  it("quiz with no course → quiz · session", () => {
    expect(generateTitle({ modeId: "quiz" })).toBe("quiz · session");
  });

  it("homework with no course → homework · session", () => {
    expect(generateTitle({ modeId: "homework" })).toBe("homework · session");
  });

  it("teach with courseTitle → courseTitle · teach (lowercase)", () => {
    expect(generateTitle({ modeId: "teach", courseTitle: "Algebra I" })).toBe("algebra i · teach");
  });

  it("quiz with courseTitle → courseTitle · quiz", () => {
    expect(generateTitle({ modeId: "quiz", courseTitle: "Geometry" })).toBe("geometry · quiz");
  });

  it("bootstrap with courseTitle → courseTitle · course design", () => {
    expect(generateTitle({ modeId: "course-create", courseTitle: "Biology" })).toBe(
      "biology · course design",
    );
  });

  it("study-skills with no course → study skills · session", () => {
    expect(generateTitle({ modeId: "study-skills" })).toBe("study skills · session");
  });
});

describe("TabsServiceImpl", () => {
  let service: TabsServiceImpl;
  let drizzle: ReturnType<typeof openDb>["db"];
  let studentId: StudentId;

  beforeEach(() => {
    const result = makeService();
    service = result.service;
    drizzle = result.db;
    studentId = makeStudentId();
  });

  describe("open + listOpen", () => {
    it("open then listOpen returns the tab", async () => {
      const sessionId = insertSession(drizzle, { studentId });
      const tab = await service.open({ studentId, sessionId });

      expect(tab.kind).toBe("session");
      expect(tab.sessionId).toBe(sessionId);
      expect(tab.modeId).toBe("teach");
      expect(tab.title).toBe("teach · new chat");
      expect(tab.closedAt).toBeNull();
      expect(tab.sortOrder).toBe(0);

      const open = await service.listOpen(studentId);
      expect(open).toHaveLength(1);
      expect(open[0]?.id).toBe(tab.id);
    });

    it("tabs are ordered by sortOrder ascending", async () => {
      const s1 = insertSession(drizzle, { studentId });
      const s2 = insertSession(drizzle, { studentId });
      const t1 = await service.open({ studentId, sessionId: s1 });
      const t2 = await service.open({ studentId, sessionId: s2 });

      const open = await service.listOpen(studentId);
      expect(open).toHaveLength(2);
      expect(open[0]?.id).toBe(t1.id);
      expect(open[1]?.id).toBe(t2.id);
      expect(t2.sortOrder).toBeGreaterThan(t1.sortOrder);
    });

    it("openDocument creates a document tab and listOpen includes it", async () => {
      const documentId = brandId<"DocumentId">("doc-abc-123") as DocumentId;
      const tab = await service.openDocument({ studentId, documentId, title: "lecture-notes.pdf" });

      expect(tab.kind).toBe("document");
      expect(tab.documentId).toBe(documentId);
      expect(tab.title).toBe("lecture-notes.pdf");
      expect(tab.closedAt).toBeNull();
      expect(tab.sortOrder).toBe(0);

      const open = await service.listOpen(studentId);
      expect(open).toHaveLength(1);
      expect(open[0]?.id).toBe(tab.id);
      expect(open[0]?.kind).toBe("document");
    });

    it("session tabs and document tabs coexist in listOpen", async () => {
      const sessionId = insertSession(drizzle, { studentId });
      const documentId = brandId<"DocumentId">("doc-xyz") as DocumentId;

      const sessionTab = await service.open({ studentId, sessionId });
      const docTab = await service.openDocument({ studentId, documentId, title: "slides.pdf" });

      const open = await service.listOpen(studentId);
      expect(open).toHaveLength(2);

      const kinds = open.map((t) => t.kind);
      expect(kinds).toContain("session");
      expect(kinds).toContain("document");

      // Session tab still has correct fields
      expect(sessionTab.kind).toBe("session");
      expect(sessionTab.modeId).toBe("teach");

      // Document tab still has correct fields
      expect(docTab.kind).toBe("document");
      expect(docTab.documentId).toBe(documentId);
    });

    it("sortOrder increments monotonically — MAX(existing)+1", async () => {
      const s1 = insertSession(drizzle, { studentId });
      const s2 = insertSession(drizzle, { studentId });
      const s3 = insertSession(drizzle, { studentId });
      const t1 = await service.open({ studentId, sessionId: s1 });
      const t2 = await service.open({ studentId, sessionId: s2 });
      const t3 = await service.open({ studentId, sessionId: s3 });

      expect(t1.sortOrder).toBe(0);
      expect(t2.sortOrder).toBe(1);
      expect(t3.sortOrder).toBe(2);
    });

    it("uses courseTitle for tab title when provided", async () => {
      const sessionId = insertSession(drizzle, { studentId, modeId: "teach" });
      const tab = await service.open({ studentId, sessionId, courseTitle: "Calculus" });
      expect(tab.title).toBe("calculus · teach");
    });
  });

  describe("close", () => {
    it("close sets closedAt; subsequent listOpen does not include it", async () => {
      const sessionId = insertSession(drizzle, { studentId });
      const tab = await service.open({ studentId, sessionId });

      await service.close(tab.id);

      const open = await service.listOpen(studentId);
      expect(open).toHaveLength(0);
    });

    it("get still returns the closed tab", async () => {
      const sessionId = insertSession(drizzle, { studentId });
      const tab = await service.open({ studentId, sessionId });
      await service.close(tab.id);

      const fetched = await service.get(tab.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.closedAt).not.toBeNull();
    });

    it("list with includeClosed:true includes closed tabs", async () => {
      const sessionId = insertSession(drizzle, { studentId });
      const tab = await service.open({ studentId, sessionId });
      await service.close(tab.id);

      const all = await service.list(studentId, { includeClosed: true });
      expect(all).toHaveLength(1);
      expect(all[0]?.id).toBe(tab.id);
    });

    it("list without includeClosed does NOT include closed tabs", async () => {
      const sessionId = insertSession(drizzle, { studentId });
      const tab = await service.open({ studentId, sessionId });
      await service.close(tab.id);

      const open = await service.list(studentId);
      expect(open).toHaveLength(0);
    });
  });

  describe("open: lazy-persisted session (empty-session-cleanup regression)", () => {
    /** Build a stub registry that only implements `get`. */
    function makeStubRegistry(states: UnpromotedSessionState[]): SessionPromotionRegistry {
      const byId = new Map(states.map((s) => [s.sessionId, s] as const));
      return {
        register: () => {},
        get: (sessionId) => byId.get(sessionId) ?? null,
        promote: () => {
          throw new Error("not used");
        },
        discard: async () => {},
        entries: () => byId.entries(),
      };
    }

    it("succeeds when sessionId is only in the promotion registry (no DB row yet)", async () => {
      const { db: drizzle2 } = openDb({ path: db.dbPath });
      const sessionId = brandId<"SessionId">(uuidv7());
      const studentId2 = makeStudentId("lazy-1");
      const registry = makeStubRegistry([
        {
          sessionId,
          studentId: studentId2,
          modeId: "teach",
          engineId: "direct.anthropic",
          startedAt: Date.now() as Timestamp,
        },
      ]);

      const svc = new TabsServiceImpl({
        db: drizzle2,
        log: makeLog(),
        sessionPromotionRegistry: () => registry,
      });

      // Bug repro: without the registry fallback, this would throw
      // "TabsService.open: session not found".
      const tab = await svc.open({ studentId: studentId2, sessionId });
      expect(tab.kind).toBe("session");
      expect(tab.sessionId).toBe(sessionId);
      expect(tab.modeId).toBe("teach");
      expect(tab.title).toBe("teach · new chat");
    });

    it("still throws when sessionId is in neither DB nor registry", async () => {
      const { db: drizzle2 } = openDb({ path: db.dbPath });
      const sessionId = brandId<"SessionId">(uuidv7());
      const studentId2 = makeStudentId("lazy-2");
      const registry = makeStubRegistry([]);

      const svc = new TabsServiceImpl({
        db: drizzle2,
        log: makeLog(),
        sessionPromotionRegistry: () => registry,
      });

      await expect(svc.open({ studentId: studentId2, sessionId })).rejects.toThrow(
        /session not found/,
      );
    });

    it("still throws when no registry is wired and DB row is missing", async () => {
      const { db: drizzle2 } = openDb({ path: db.dbPath });
      const sessionId = brandId<"SessionId">(uuidv7());
      const studentId2 = makeStudentId("lazy-3");

      // No `sessionPromotionRegistry` dep — preserves legacy behavior.
      const svc = new TabsServiceImpl({ db: drizzle2, log: makeLog() });

      await expect(svc.open({ studentId: studentId2, sessionId })).rejects.toThrow(
        /session not found/,
      );
    });
  });

  describe("reopen", () => {
    it("reopen clears closedAt and pushes sortOrder to the end", async () => {
      const s1 = insertSession(drizzle, { studentId });
      const s2 = insertSession(drizzle, { studentId });
      const t1 = await service.open({ studentId, sessionId: s1 });
      const t2 = await service.open({ studentId, sessionId: s2 });

      await service.close(t1.id);

      const reopened = await service.reopen(t1.id);
      expect(reopened.closedAt).toBeNull();
      expect(reopened.sortOrder).toBeGreaterThan(t2.sortOrder);

      const open = await service.listOpen(studentId);
      const ids = open.map((t) => t.id);
      expect(ids).toContain(t1.id);
      expect(ids).toContain(t2.id);
    });

    it("reopen a document tab returns it with kind=document", async () => {
      const documentId = brandId<"DocumentId">("doc-reopen") as DocumentId;
      const tab = await service.openDocument({ studentId, documentId, title: "my-doc.pdf" });

      await service.close(tab.id);
      const open0 = await service.listOpen(studentId);
      expect(open0).toHaveLength(0);

      const reopened = await service.reopen(tab.id);
      expect(reopened.kind).toBe("document");
      expect(reopened.closedAt).toBeNull();
      if (reopened.kind === "document") expect(reopened.documentId).toBe(documentId);

      const open1 = await service.listOpen(studentId);
      expect(open1).toHaveLength(1);
      expect(open1[0]?.id).toBe(tab.id);
    });
  });

  describe("touch", () => {
    it("touch updates lastSeenAt", async () => {
      const sessionId = insertSession(drizzle, { studentId });
      const tab = await service.open({ studentId, sessionId });
      const before = tab.lastSeenAt;

      // Small delay to ensure timestamp changes.
      await new Promise((r) => setTimeout(r, 5));
      await service.touch(tab.id);

      const updated = await service.get(tab.id);
      expect(updated?.lastSeenAt).toBeGreaterThan(before);
    });
  });

  describe("rename", () => {
    it("rename updates the title", async () => {
      const sessionId = insertSession(drizzle, { studentId });
      const tab = await service.open({ studentId, sessionId });

      const renamed = await service.rename(tab.id, "custom title");
      expect(renamed.title).toBe("custom title");

      const fetched = await service.get(tab.id);
      expect(fetched?.title).toBe("custom title");
    });
  });

  describe("student isolation", () => {
    it("two students' tabs are isolated", async () => {
      const studentA = makeStudentId("a");
      const studentB = makeStudentId("b");

      const sA = insertSession(drizzle, { studentId: studentA });
      const sB = insertSession(drizzle, { studentId: studentB });

      await service.open({ studentId: studentA, sessionId: sA });
      await service.open({ studentId: studentB, sessionId: sB });

      const openA = await service.listOpen(studentA);
      const openB = await service.listOpen(studentB);

      expect(openA).toHaveLength(1);
      expect(openB).toHaveLength(1);
      // Narrow to session kind to access sessionId
      const tabA = openA[0];
      const tabB = openB[0];
      expect(tabA?.kind).toBe("session");
      expect(tabB?.kind).toBe("session");
      if (tabA?.kind === "session") expect(tabA.sessionId).toBe(sA);
      if (tabB?.kind === "session") expect(tabB.sessionId).toBe(sB);
    });

    it("two students' document tabs are isolated", async () => {
      const studentA = makeStudentId("a");
      const studentB = makeStudentId("b");

      const docA = brandId<"DocumentId">("doc-a") as DocumentId;
      const docB = brandId<"DocumentId">("doc-b") as DocumentId;

      await service.openDocument({ studentId: studentA, documentId: docA, title: "doc-a.pdf" });
      await service.openDocument({ studentId: studentB, documentId: docB, title: "doc-b.pdf" });

      const openA = await service.listOpen(studentA);
      const openB = await service.listOpen(studentB);

      expect(openA).toHaveLength(1);
      expect(openB).toHaveLength(1);
      const tabA = openA[0];
      const tabB = openB[0];
      if (tabA?.kind === "document") expect(tabA.documentId).toBe(docA);
      if (tabB?.kind === "document") expect(tabB.documentId).toBe(docB);
    });
  });

  describe("get", () => {
    it("get returns null for nonexistent tab", async () => {
      // biome-ignore lint/suspicious/noExplicitAny: test passthrough of unknown tab id
      const result = await service.get(brandId<"TabId">("nonexistent-tab-id") as any);
      expect(result).toBeNull();
    });
  });
});
