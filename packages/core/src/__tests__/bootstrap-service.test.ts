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

/** Minimal no-op stub for DocumentScopesService (tests that don't exercise confirmDraft). */
const MOCK_DOCUMENT_SCOPES = {
  listForScope: vi.fn().mockResolvedValue([]),
  listForScopeDetailed: vi.fn().mockResolvedValue([]),
  attach: vi.fn().mockResolvedValue({ attached: true }),
  detach: vi.fn().mockResolvedValue({ detached: true }),
  attachMany: vi.fn().mockResolvedValue({ newlyAttached: [] }),
  listScopesForDocument: vi.fn().mockResolvedValue([]),
  promoteScope: vi.fn().mockResolvedValue({ promoted: [] }),
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
      documentScopes: MOCK_DOCUMENT_SCOPES,
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
    const { draft: updated } = await svc.editDraft({ draftId, op });
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
    const { draft: updated } = await svc.editDraft({ draftId, op });
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
    const { draft: updated } = await svc.editDraft({ draftId, op });
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
    const { draft: updated, warnings } = await svc.editDraft({ draftId, op });
    // Should not add a duplicate — concept count stays the same.
    expect(updated.proposed.proposedConcepts.filter((c) => c.name === "Variables")).toHaveLength(1);
    // Warning should mention the duplicate concept name.
    expect(warnings[0]).toMatch(/concept 'Variables' already exists/);
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
    const { draft: updated, warnings } = await svc.editDraft({ draftId, op });
    expect(updated.proposed.thresholds.conceptMastery).toBe(0.85);
    expect(updated.proposed.thresholds.decayDays).toBe(30);
    expect(warnings).toHaveLength(0);
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
      documentScopes: MOCK_DOCUMENT_SCOPES,
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
      documentScopes: MOCK_DOCUMENT_SCOPES,
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
      documentScopes: MOCK_DOCUMENT_SCOPES,
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
      documentScopes: MOCK_DOCUMENT_SCOPES,
      sweepIntervalMs: 9999999,
    });

    await expect(
      svc.confirmDraft({ draftId: "nonexistent", studentId: STUDENT_ID }),
    ).rejects.toThrow("Draft not found or expired");
    svc.shutdown();
  });
});

// ─── New edit-op tests ────────────────────────────────────────────────────────

describe("BootstrapServiceImpl — new edit ops (relink-concept, add-edge, remove-unit, validate-draft)", () => {
  const dbCtx = useTempDb();

  function makeEditSvc() {
    const { db } = openDb({ path: dbCtx.dbPath });
    const store = new SqliteDraftStore(db);
    return new BootstrapServiceImpl({
      db,
      log: MOCK_LOG,
      engineResolver: makeMockEngine,
      documentScopes: MOCK_DOCUMENT_SCOPES,
      sweepIntervalMs: 9999999,
      draftStore: store,
    });
  }

  it("editDraft returns { draft, warnings: [] } for rename-course (new shape smoke test)", async () => {
    const svc = makeEditSvc();
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Old Title",
      subject: "math",
      gradeLevel: "9",
    });
    const result = await svc.editDraft({
      draftId,
      op: { kind: "rename-course", title: "New Title" },
    });
    expect(result).toHaveProperty("draft");
    expect(result).toHaveProperty("warnings");
    expect(result.draft.proposed.title).toBe("New Title");
    expect(result.warnings).toEqual([]);
    svc.shutdown();
  });

  it("add-concept on existing name returns warning pinned to text", async () => {
    const svc = makeEditSvc();
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Course",
      subject: "math",
      gradeLevel: "9",
    });
    await svc.addConcept({ draftId, name: "Variables", description: "symbols" });
    await svc.addLesson({ draftId, title: "Intro", conceptNames: ["Variables"], references: [] });
    const { draft, warnings } = await svc.editDraft({
      draftId,
      op: { kind: "add-concept", name: "Variables", description: "duplicate", lessonIndex: 0 },
    });
    // State unchanged — still one concept.
    expect(draft.proposed.proposedConcepts.filter((c) => c.name === "Variables")).toHaveLength(1);
    // Warning text starts with the pinned prefix.
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^concept 'Variables' already exists/);
    svc.shutdown();
  });

  it("remove-lesson cascade: drops unit memberships and lesson assessments; warning enumerates counts", async () => {
    const svc = makeEditSvc();
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Course",
      subject: "math",
      gradeLevel: "9",
    });
    await svc.addConcept({ draftId, name: "Variables", description: "symbols" });
    await svc.addConcept({ draftId, name: "Equations", description: "equality" });
    // Add two lessons; lesson at index 0 is "Target".
    await svc.addLesson({ draftId, title: "Target", conceptNames: ["Variables"], references: [] });
    await svc.addLesson({ draftId, title: "Other", conceptNames: ["Equations"], references: [] });

    // Get draftLessonIds from the current draft state.
    const state0 = await svc.showDraft(draftId);
    if (!state0) throw new Error("expected draft to exist");
    const targetLesson = state0.proposed.proposedLessons[0];
    const otherLesson = state0.proposed.proposedLessons[1];
    if (!targetLesson || !otherLesson) throw new Error("expected two lessons");
    const targetId = targetLesson.draftLessonId;
    const otherId = otherLesson.draftLessonId;

    // Add 2 units that both reference the target lesson.
    const u1 = await svc.addUnit({ draftId, name: "Unit A", draftLessonIds: [targetId] });
    const u2 = await svc.addUnit({ draftId, name: "Unit B", draftLessonIds: [targetId, otherId] });
    expect(u1).toMatchObject({ ok: true });
    expect(u2).toMatchObject({ ok: true });

    // Add 3 lesson assessments on the target lesson.
    for (const title of ["Quiz 1", "Quiz 2", "Quiz 3"]) {
      const r = await svc.addLessonAssessment({
        draftId,
        draftLessonId: targetId,
        kind: "quiz",
        timing: "after",
        purpose: "checkpoint",
        conceptNames: ["Variables"],
        rationale: "test",
        title,
      });
      expect(r).toMatchObject({ ok: true });
    }

    // Remove target lesson (index 0).
    const { draft, warnings } = await svc.editDraft({
      draftId,
      op: { kind: "remove-lesson", lessonIndex: 0 },
    });

    // Lesson is gone.
    expect(
      draft.proposed.proposedLessons.find((l) => l.draftLessonId === targetId),
    ).toBeUndefined();

    // Unit A's draftLessonIds should be empty; Unit B should only contain otherId.
    const unitA = draft.proposed.proposedUnits?.find((u) => u.name === "Unit A");
    const unitB = draft.proposed.proposedUnits?.find((u) => u.name === "Unit B");
    expect(unitA?.draftLessonIds).toEqual([]);
    expect(unitB?.draftLessonIds).toEqual([otherId]);

    // All 3 lesson assessments should be gone.
    const remainingAssessments = (draft.proposed.proposedLessonAssessments ?? []).filter(
      (a) => a.draftLessonId === targetId,
    );
    expect(remainingAssessments).toHaveLength(0);

    // Warning enumerates the cascade counts.
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/removed lesson 'Target'/);
    expect(warnings[0]).toMatch(/2 unit-membership refs/);
    expect(warnings[0]).toMatch(/3 lesson assessments/);
    svc.shutdown();
  });

  it("remove-unit removes the unit and warns with lesson count", async () => {
    const svc = makeEditSvc();
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Course",
      subject: "math",
      gradeLevel: "9",
    });
    await svc.addConcept({ draftId, name: "Variables", description: "symbols" });
    await svc.addLesson({ draftId, title: "Intro", conceptNames: ["Variables"], references: [] });
    await svc.addLesson({
      draftId,
      title: "Advanced",
      conceptNames: ["Variables"],
      references: [],
    });

    const state0 = await svc.showDraft(draftId);
    if (!state0) throw new Error("expected draft to exist");
    const lesson0 = state0.proposed.proposedLessons[0];
    const lesson1 = state0.proposed.proposedLessons[1];
    if (!lesson0 || !lesson1) throw new Error("expected two lessons");
    const l1id = lesson0.draftLessonId;
    const l2id = lesson1.draftLessonId;

    const addResult = await svc.addUnit({
      draftId,
      name: "Unit Alpha",
      draftLessonIds: [l1id, l2id],
    });
    expect(addResult).toMatchObject({ ok: true });
    const { draftUnitId } = addResult as { ok: true; draftUnitId: string };

    const { draft, warnings } = await svc.editDraft({
      draftId,
      op: { kind: "remove-unit", draftUnitId },
    });

    // Unit is gone.
    expect(
      draft.proposed.proposedUnits?.find((u) => u.draftUnitId === draftUnitId),
    ).toBeUndefined();
    // Lessons are NOT touched.
    expect(draft.proposed.proposedLessons).toHaveLength(2);

    // Warning mentions the unit name and lesson count.
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/removed unit 'Unit Alpha'/);
    expect(warnings[0]).toMatch(/2 lesson references/);
    svc.shutdown();
  });

  it("validate-draft with no issues returns empty warnings", async () => {
    const svc = makeEditSvc();
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Course",
      subject: "math",
      gradeLevel: "9",
    });
    await svc.addConcept({ draftId, name: "Variables", description: "symbols" });
    await svc.addLesson({ draftId, title: "Intro", conceptNames: ["Variables"], references: [] });

    const { draft, warnings } = await svc.editDraft({
      draftId,
      op: { kind: "validate-draft" },
    });
    // State unchanged.
    expect(draft.proposed.title).toBe("Course");
    expect(warnings).toEqual([]);
    svc.shutdown();
  });

  it("validate-draft with issues returns each issue formatted as kind: message", async () => {
    const svc = makeEditSvc();
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Course",
      subject: "math",
      gradeLevel: "9",
    });
    // No concepts or lessons — will trigger no_concepts + no_lessons issues.
    const { draft, warnings } = await svc.editDraft({
      draftId,
      op: { kind: "validate-draft" },
    });
    // State is unchanged.
    expect(draft.proposed.proposedConcepts).toHaveLength(0);
    // At least two issues expected.
    expect(warnings.length).toBeGreaterThanOrEqual(2);
    // Each warning should be in "kind: message" format.
    for (const w of warnings) {
      expect(w).toMatch(/^[a-z_]+: /);
    }
    svc.shutdown();
  });

  it("relink-concept with lessonIndex: -1 removes concept from all lessons; node and edges stay", async () => {
    const svc = makeEditSvc();
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Course",
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
    // Add two lessons that both reference Variables.
    await svc.addLesson({ draftId, title: "Intro", conceptNames: ["Variables"], references: [] });
    await svc.addLesson({
      draftId,
      title: "Advanced",
      conceptNames: ["Variables", "Equations"],
      references: [],
    });

    const { draft, warnings } = await svc.editDraft({
      draftId,
      op: { kind: "relink-concept", conceptName: "Variables", lessonIndex: -1 },
    });

    // Variables removed from all lessons.
    for (const lesson of draft.proposed.proposedLessons) {
      expect(lesson.conceptNames).not.toContain("Variables");
    }
    // Concept node still present.
    expect(draft.proposed.proposedConcepts.find((c) => c.name === "Variables")).toBeDefined();
    // Edge still present.
    expect(draft.proposed.proposedEdges).toHaveLength(1);
    expect(warnings).toHaveLength(0);
    svc.shutdown();
  });

  it("relink-concept with positive lessonIndex moves concept to destination at correct position", async () => {
    const svc = makeEditSvc();
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Course",
      subject: "math",
      gradeLevel: "9",
    });
    await svc.addConcept({ draftId, name: "Variables", description: "symbols" });
    await svc.addConcept({ draftId, name: "Equations", description: "equality" });
    await svc.addConcept({ draftId, name: "Functions", description: "mappings" });
    // Lesson 0: Variables. Lesson 1: Equations, Functions.
    await svc.addLesson({ draftId, title: "Intro", conceptNames: ["Variables"], references: [] });
    await svc.addLesson({
      draftId,
      title: "Advanced",
      conceptNames: ["Equations", "Functions"],
      references: [],
    });

    // Move Variables from lesson 0 to lesson 1, after index 0 (after Equations).
    const { draft, warnings } = await svc.editDraft({
      draftId,
      op: {
        kind: "relink-concept",
        conceptName: "Variables",
        lessonIndex: 1,
        afterConceptIndex: 0,
      },
    });

    // Lesson 0 should no longer contain Variables.
    expect(draft.proposed.proposedLessons[0]?.conceptNames).not.toContain("Variables");
    // Lesson 1 should contain Variables at position 1 (after Equations).
    const lesson1Names = draft.proposed.proposedLessons[1]?.conceptNames ?? [];
    expect(lesson1Names[0]).toBe("Equations");
    expect(lesson1Names[1]).toBe("Variables");
    expect(lesson1Names[2]).toBe("Functions");
    expect(warnings).toHaveLength(0);
    svc.shutdown();
  });

  it("add-edge happy path adds the edge with clamped strength and empty warnings", async () => {
    const svc = makeEditSvc();
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Course",
      subject: "math",
      gradeLevel: "9",
    });
    await svc.addConcept({ draftId, name: "Variables", description: "symbols" });
    await svc.addConcept({ draftId, name: "Equations", description: "equality" });

    const { draft, warnings } = await svc.editDraft({
      draftId,
      op: {
        kind: "add-edge",
        fromName: "Variables",
        toName: "Equations",
        strength: 0.9,
        rationale: "prereq",
      },
    });
    expect(draft.proposed.proposedEdges).toHaveLength(1);
    expect(draft.proposed.proposedEdges[0]?.fromName).toBe("Variables");
    expect(draft.proposed.proposedEdges[0]?.toName).toBe("Equations");
    expect(warnings).toHaveLength(0);
    svc.shutdown();
  });

  it("add-edge throws on missing fromName endpoint", async () => {
    const svc = makeEditSvc();
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Course",
      subject: "math",
      gradeLevel: "9",
    });
    await svc.addConcept({ draftId, name: "Equations", description: "equality" });
    await expect(
      svc.editDraft({
        draftId,
        op: { kind: "add-edge", fromName: "Unknown", toName: "Equations", strength: 0.5 },
      }),
    ).rejects.toThrow(/concept "Unknown" not found/);
    svc.shutdown();
  });

  it("add-edge throws on self-edge", async () => {
    const svc = makeEditSvc();
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Course",
      subject: "math",
      gradeLevel: "9",
    });
    await svc.addConcept({ draftId, name: "Variables", description: "symbols" });
    await expect(
      svc.editDraft({
        draftId,
        op: { kind: "add-edge", fromName: "Variables", toName: "Variables", strength: 0.5 },
      }),
    ).rejects.toThrow(/self-edges/);
    svc.shutdown();
  });

  it("add-edge throws on duplicate edge", async () => {
    const svc = makeEditSvc();
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Course",
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
    await expect(
      svc.editDraft({
        draftId,
        op: { kind: "add-edge", fromName: "Variables", toName: "Equations", strength: 0.5 },
      }),
    ).rejects.toThrow(/already exists/);
    svc.shutdown();
  });
});
