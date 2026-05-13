import { openDb } from "@praxis/core/db";
import { sessions } from "@praxis/memory/schema";
import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import type { SessionId, StudentId } from "../../types/index.js";
import { brandId } from "../../types/index.js";
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
    expect(generateTitle({ modeId: "bootstrap" })).toBe("course design · new course");
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
    expect(generateTitle({ modeId: "bootstrap", courseTitle: "Biology" })).toBe(
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
      expect(openA[0]?.sessionId).toBe(sA);
      expect(openB[0]?.sessionId).toBe(sB);
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
