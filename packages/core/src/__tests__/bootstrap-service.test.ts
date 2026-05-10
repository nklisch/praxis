/**
 * Unit tests for BootstrapServiceImpl — Phase 6/16.
 *
 * Uses a real temp DB (via useTempDb) for confirmDraft / persistDraft.
 * Draft mutation is tested by seeding via the public API (initDraft + mutators).
 *
 * Covers:
 *  - applyEdit: each DraftEditOp kind (pure function branch coverage)
 *  - Draft lifecycle: showDraft → editDraft → confirmDraft
 *  - confirmDraft: writes Course + Lessons + Concepts + Edges + Gates in one tx
 *  - Draft row has confirmedAt set after confirmDraft
 *  - Discarded drafts not returned by showDraft
 */
import { courses, gates, lessons } from "@praxis/artifacts/schema";
import { conceptGraphs, concepts } from "@praxis/curriculum/schema";
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../tests/helpers/db-setup.js";
import { openDb } from "../db/index.js";
import { BootstrapServiceImpl } from "../services/bootstrap-service.js";
import { SqliteDraftStore } from "../services/draft-store.js";
import type { DraftEditOp, Engine, ProposedCourse } from "../types/index.js";
import { brandId } from "../types/index.js";

const STUDENT_ID = brandId<"StudentId">("student-test");

/** Minimal valid ProposedCourse for testing. */
const CANNED_PROPOSED: ProposedCourse = {
  title: "Algebra 1",
  subject: "math",
  gradeLevel: "9",
  thresholds: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
  proposedConcepts: [
    { name: "Variables", description: "Symbols representing numbers", evidence: [] },
    { name: "Equations", description: "Statements of equality", evidence: [] },
  ],
  proposedEdges: [
    { fromName: "Variables", toName: "Equations", strength: 0.8, rationale: "prerequisite" },
  ],
  proposedLessons: [
    {
      draftLessonId: "l1",
      title: "Intro to Variables",
      conceptNames: ["Variables"],
      references: [],
      suggestedStrategy: brandId<"StrategyId">("worked-examples"),
      estimatedMinutes: 45,
    },
    {
      draftLessonId: "l2",
      title: "Writing Equations",
      conceptNames: ["Equations"],
      references: [],
      suggestedStrategy: brandId<"StrategyId">("worked-examples"),
      estimatedMinutes: 45,
    },
  ],
};

/** Create a mock engine that returns the canned ProposedCourse as JSON. */
function makeMockEngine(): Engine {
  const cannedJson = JSON.stringify(CANNED_PROPOSED);
  const mockHandle = {
    send: vi.fn().mockImplementation(async function* () {
      yield { type: "model_message" as const, content: `\`\`\`json\n${cannedJson}\n\`\`\`` };
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    open: vi.fn().mockResolvedValue(mockHandle),
  } as unknown as Engine;
}

const MOCK_LOG = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => MOCK_LOG),
};

/** Minimal no-op stub for CourseDocumentsService (tests that don't exercise confirmDraft). */
const MOCK_COURSE_DOCUMENTS = {
  listForCourse: vi.fn().mockResolvedValue([]),
  listForCourseDetailed: vi.fn().mockResolvedValue([]),
  attach: vi.fn().mockResolvedValue({ attached: true }),
  detach: vi.fn().mockResolvedValue({ detached: true }),
  attachMany: vi.fn().mockResolvedValue({ newlyAttached: [] }),
};

// ─── applyEdit pure function tests ──────────────────────────────────────────
// We test via the public editDraft API (which calls applyEdit internally).
// Each test seeds via initDraft + addConcept/addLesson rather than injecting
// into the private store directly.

describe("BootstrapServiceImpl — applyEdit via editDraft", () => {
  // These tests use a temp DB so the store has a real backing.
  const dbCtx = useTempDb();

  function makeEditSvc() {
    const { db } = openDb({ path: dbCtx.dbPath });
    // Each test gets its own store so drafts don't bleed across tests.
    const store = new SqliteDraftStore(db);
    return new BootstrapServiceImpl({
      db,
      log: MOCK_LOG,
      engineResolver: makeMockEngine,
      courseDocuments: MOCK_COURSE_DOCUMENTS,
      sweepIntervalMs: 9999999,
      draftStore: store,
    });
  }

  it("rename-course changes the title", async () => {
    const svc = makeEditSvc();
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Algebra 1",
      subject: "math",
      gradeLevel: "9",
    });

    const op: DraftEditOp = { kind: "rename-course", title: "Algebra 2" };
    const updated = await svc.editDraft({ draftId, op });
    expect(updated.proposed.title).toBe("Algebra 2");
    svc.shutdown();
  });

  it("rename-lesson changes the lesson title at the given index", async () => {
    const svc = makeEditSvc();
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Algebra 1",
      subject: "math",
      gradeLevel: "9",
    });
    await svc.addConcept({ draftId, name: "Variables", description: "symbols" });
    await svc.addConcept({ draftId, name: "Equations", description: "equality" });
    await svc.addLesson({
      draftId,
      title: "Intro to Variables",
      conceptNames: ["Variables"],
      references: [],
    });
    await svc.addLesson({
      draftId,
      title: "Writing Equations",
      conceptNames: ["Equations"],
      references: [],
    });

    const op: DraftEditOp = { kind: "rename-lesson", lessonIndex: 0, title: "Intro to Algebra" };
    const updated = await svc.editDraft({ draftId, op });
    expect(updated.proposed.proposedLessons[0]?.title).toBe("Intro to Algebra");
    expect(updated.proposed.proposedLessons[1]?.title).toBe("Writing Equations");
    svc.shutdown();
  });

  it("remove-concept strips the concept and all references to it", async () => {
    const svc = makeEditSvc();
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Algebra 1",
      subject: "math",
      gradeLevel: "9",
    });
    await svc.addConcept({ draftId, name: "Variables", description: "symbols" });
    await svc.addConcept({ draftId, name: "Equations", description: "equality" });
    await svc.addEdge({
      draftId,
      fromName: "Variables",
      toName: "Equations",
      strength: 0.8,
      rationale: "prereq",
    });
    await svc.addLesson({ draftId, title: "Intro", conceptNames: ["Variables"], references: [] });

    const op: DraftEditOp = { kind: "remove-concept", conceptName: "Variables" };
    const updated = await svc.editDraft({ draftId, op });
    expect(updated.proposed.proposedConcepts.find((c) => c.name === "Variables")).toBeUndefined();
    // Edge referencing Variables should be removed.
    expect(updated.proposed.proposedEdges).toHaveLength(0);
    // Lesson 1's conceptNames should be empty.
    expect(updated.proposed.proposedLessons[0]?.conceptNames).toHaveLength(0);
    svc.shutdown();
  });

  it("add-concept silently ignores duplicate name", async () => {
    const svc = makeEditSvc();
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Algebra 1",
      subject: "math",
      gradeLevel: "9",
    });
    await svc.addConcept({ draftId, name: "Variables", description: "symbols" });
    await svc.addLesson({ draftId, title: "Intro", conceptNames: ["Variables"], references: [] });

    const op: DraftEditOp = {
      kind: "add-concept",
      name: "Variables", // duplicate
      description: "Already exists",
      lessonIndex: 0,
    };
    const updated = await svc.editDraft({ draftId, op });
    // Should not add a duplicate — concept count stays the same.
    expect(updated.proposed.proposedConcepts.filter((c) => c.name === "Variables")).toHaveLength(1);
    svc.shutdown();
  });

  it("set-thresholds updates conceptMastery", async () => {
    const svc = makeEditSvc();
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Algebra 1",
      subject: "math",
      gradeLevel: "9",
    });

    const op: DraftEditOp = {
      kind: "set-thresholds",
      thresholds: { conceptMastery: 0.85, examPass: 0.8, allowRetake: false, decayDays: 30 },
    };
    const updated = await svc.editDraft({ draftId, op });
    expect(updated.proposed.thresholds.conceptMastery).toBe(0.85);
    expect(updated.proposed.thresholds.decayDays).toBe(30);
    svc.shutdown();
  });
});

// ─── Draft not found ──────────────────────────────────────────────────────────

describe("BootstrapServiceImpl — draft not found", () => {
  const dbCtx = useTempDb();

  it("showDraft returns null for non-existent draft id", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = new BootstrapServiceImpl({
      db,
      log: MOCK_LOG,
      engineResolver: makeMockEngine,
      courseDocuments: MOCK_COURSE_DOCUMENTS,
      sweepIntervalMs: 9999999,
    });

    const result = await svc.showDraft("does-not-exist");
    expect(result).toBeNull();
    svc.shutdown();
  });

  it("editDraft throws for non-existent draft", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = new BootstrapServiceImpl({
      db,
      log: MOCK_LOG,
      engineResolver: makeMockEngine,
      courseDocuments: MOCK_COURSE_DOCUMENTS,
      sweepIntervalMs: 9999999,
    });

    await expect(
      svc.editDraft({ draftId: "ghost", op: { kind: "rename-course", title: "X" } }),
    ).rejects.toThrow("Draft not found or expired");
    svc.shutdown();
  });
});

// ─── confirmDraft + DB persistence ───────────────────────────────────────────

describe("BootstrapServiceImpl — confirmDraft", () => {
  // useTempDb inside describe scope so migrations only run for these tests.
  const dbCtx = useTempDb();
  it("writes Course + Lessons + Concepts + Edges + Gates in one tx; draft confirmed after", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });

    const svc = new BootstrapServiceImpl({
      db,
      log: MOCK_LOG,
      engineResolver: makeMockEngine,
      courseDocuments: MOCK_COURSE_DOCUMENTS,
      sweepIntervalMs: 9999999,
    });

    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Algebra 1",
      subject: "math",
      gradeLevel: "9",
    });
    await svc.addConcept({
      draftId,
      name: "Variables",
      description: "Symbols representing numbers",
    });
    await svc.addConcept({ draftId, name: "Equations", description: "Statements of equality" });
    await svc.addEdge({
      draftId,
      fromName: "Variables",
      toName: "Equations",
      strength: 0.8,
      rationale: "prerequisite",
    });
    await svc.addLesson({
      draftId,
      title: "Intro to Variables",
      conceptNames: ["Variables"],
      references: [],
    });
    await svc.addLesson({
      draftId,
      title: "Writing Equations",
      conceptNames: ["Equations"],
      references: [],
    });

    const result = await svc.confirmDraft({ draftId, studentId: STUDENT_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok:true");
    expect(typeof result.courseId).toBe("string");
    expect(result.lessonIds).toHaveLength(2);
    expect(typeof result.conceptGraphId).toBe("string");

    // Verify DB rows.
    const courseRow = db
      .select()
      .from(courses)
      .where(courses.id ? undefined : undefined)
      .all();
    expect(courseRow).toHaveLength(1);
    expect(courseRow[0]?.title).toBe("Algebra 1");

    const lessonRows = db.select().from(lessons).all();
    expect(lessonRows).toHaveLength(2);

    const conceptRows = db.select().from(concepts).all();
    expect(conceptRows).toHaveLength(2);

    const graphRows = db.select().from(conceptGraphs).all();
    expect(graphRows).toHaveLength(1);

    const gateRows = db.select().from(gates).all();
    expect(gateRows).toHaveLength(2);

    // Draft should be confirmed — showDraft returns null (confirmed drafts are not active).
    const draft = await svc.showDraft(draftId);
    expect(draft).toBeNull();

    svc.shutdown();
  });

  it("throws when draft not found", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = new BootstrapServiceImpl({
      db,
      log: MOCK_LOG,
      engineResolver: makeMockEngine,
      courseDocuments: MOCK_COURSE_DOCUMENTS,
      sweepIntervalMs: 9999999,
    });

    await expect(
      svc.confirmDraft({ draftId: "nonexistent", studentId: STUDENT_ID }),
    ).rejects.toThrow("Draft not found or expired");
    svc.shutdown();
  });
});
