/**
 * Tests for the four chunked-query methods on CourseCreateServiceImpl:
 *   listUnits, listLessonsInUnit, getLessonDetail, listDanglingRefs
 *
 * All tests use a real temp DB (SqliteDraftStore) seeded via the public API
 * (initDraft + addConcept + addEdge + addLesson + addUnit + addLessonAssessment).
 */
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../tests/helpers/db-setup.js";
import { openDb } from "../db/index.js";
import { CourseCreateServiceImpl } from "../services/course-create-service.js";
import { SqliteDraftStore } from "../services/draft-store.js";
import type { DraftCourseState, Engine, Timestamp } from "../types/index.js";
import { brandId } from "../types/index.js";

const STUDENT_ID = brandId<"StudentId">("student-queries-test");

const MOCK_LOG = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => MOCK_LOG),
};

const MOCK_DOCUMENT_SCOPES = {
  listForScope: vi.fn().mockResolvedValue([]),
  listForScopeDetailed: vi.fn().mockResolvedValue([]),
  attach: vi.fn().mockResolvedValue({ attached: true }),
  detach: vi.fn().mockResolvedValue({ detached: true }),
  attachMany: vi.fn().mockResolvedValue({ newlyAttached: [] }),
  listScopesForDocument: vi.fn().mockResolvedValue([]),
  promoteScope: vi.fn().mockResolvedValue({ promoted: [] }),
  listOrphaned: vi.fn().mockResolvedValue([]),
};

function makeEngine(): Engine {
  return { open: vi.fn() } as unknown as Engine;
}

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeService(dbPath: string) {
  const { db } = openDb({ path: dbPath });
  const store = new SqliteDraftStore(db);
  const svc = new CourseCreateServiceImpl({
    db,
    log: MOCK_LOG,
    engineResolver: makeEngine,
    documentScopes: MOCK_DOCUMENT_SCOPES,
    sweepIntervalMs: 9_999_999,
    draftStore: store,
  });
  return { svc, store };
}

// ─── listUnits ────────────────────────────────────────────────────────────────

describe("CourseCreateServiceImpl.listUnits", () => {
  const dbCtx = useTempDb();

  it("returns null for unknown draftId", async () => {
    const { svc } = makeService(dbCtx.dbPath);
    const result = await svc.listUnits("nonexistent-draft");
    expect(result).toBeNull();
    svc.shutdown();
  });

  it("returns an empty array when draft has no units", async () => {
    const { svc } = makeService(dbCtx.dbPath);
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "No Units",
      subject: "math",
      gradeLevel: "9",
    });
    const result = await svc.listUnits(draftId);
    expect(result).toEqual([]);
    svc.shutdown();
  });

  it("returns unit entries with correct lessonCount and hasSummative", async () => {
    const { svc } = makeService(dbCtx.dbPath);
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Algebra 1",
      subject: "math",
      gradeLevel: "9",
    });

    // Seed two concepts + two lessons.
    await svc.addConcept({ draftId, name: "Variables", description: "symbols" });
    await svc.addConcept({ draftId, name: "Equations", description: "equality statements" });
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

    // Get lesson ids from the draft.
    const draft = await svc.showDraft(draftId);
    const lessonIds = draft!.proposed.proposedLessons.map((l) => l.draftLessonId);

    // Unit 1: two lessons, no summative.
    const { draftUnitId: unitId1 } = (await svc.addUnit({
      draftId,
      name: "Foundations",
      summary: "Core algebra concepts",
      draftLessonIds: lessonIds,
    })) as { ok: true; draftUnitId: string };

    // Unit 2: no lessons (empty), with summative.
    const { draftUnitId: unitId2 } = (await svc.addUnit({
      draftId,
      name: "Assessment Unit",
      draftLessonIds: [],
      summative: {
        kind: "exam",
        title: "Unit Exam",
        conceptNames: ["Variables", "Equations"],
        rationale: "covers both concepts",
      },
    })) as { ok: true; draftUnitId: string };

    const units = await svc.listUnits(draftId);
    expect(units).not.toBeNull();
    expect(units).toHaveLength(2);

    const unit1 = units!.find((u) => u.draftUnitId === unitId1);
    expect(unit1).toMatchObject({
      name: "Foundations",
      summary: "Core algebra concepts",
      lessonCount: 2,
      hasSummative: false,
    });

    const unit2 = units!.find((u) => u.draftUnitId === unitId2);
    expect(unit2).toMatchObject({
      name: "Assessment Unit",
      lessonCount: 0,
      hasSummative: true,
    });

    svc.shutdown();
  });
});

// ─── listLessonsInUnit ────────────────────────────────────────────────────────

describe("CourseCreateServiceImpl.listLessonsInUnit", () => {
  const dbCtx = useTempDb();

  it("returns null for unknown draftId", async () => {
    const { svc } = makeService(dbCtx.dbPath);
    const result = await svc.listLessonsInUnit({
      draftId: "nonexistent-draft",
      draftUnitId: "any-unit",
    });
    expect(result).toBeNull();
    svc.shutdown();
  });

  it("returns null for unknown draftUnitId within an existing draft", async () => {
    const { svc } = makeService(dbCtx.dbPath);
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Test",
      subject: "math",
      gradeLevel: "9",
    });
    const result = await svc.listLessonsInUnit({ draftId, draftUnitId: "ghost-unit" });
    expect(result).toBeNull();
    svc.shutdown();
  });

  it("returns lessons with conceptCount and assessmentCount", async () => {
    const { svc } = makeService(dbCtx.dbPath);
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Physics",
      subject: "physics",
      gradeLevel: "10",
    });

    await svc.addConcept({ draftId, name: "Force", description: "push or pull" });
    await svc.addConcept({ draftId, name: "Mass", description: "amount of matter" });
    await svc.addConcept({ draftId, name: "Acceleration", description: "rate of velocity change" });
    await svc.addLesson({
      draftId,
      title: "Newton's Second Law",
      conceptNames: ["Force", "Mass", "Acceleration"],
      references: [],
    });
    await svc.addLesson({
      draftId,
      title: "Forces in Nature",
      conceptNames: ["Force"],
      references: [],
    });

    const draft = await svc.showDraft(draftId);
    const [lessonId1, lessonId2] = draft!.proposed.proposedLessons.map((l) => l.draftLessonId);

    // Add an assessment to lesson 1.
    await svc.addLessonAssessment({
      draftId,
      draftLessonId: lessonId1!,
      kind: "quiz",
      timing: "after",
      purpose: "practice",
      conceptNames: ["Force"],
      rationale: "quick check",
      title: "Force Quiz",
    });

    // Create unit with both lessons.
    const { draftUnitId } = (await svc.addUnit({
      draftId,
      name: "Mechanics",
      draftLessonIds: [lessonId1!, lessonId2!],
    })) as { ok: true; draftUnitId: string };

    const result = await svc.listLessonsInUnit({ draftId, draftUnitId });
    expect(result).not.toBeNull();
    expect(result!.draftUnitId).toBe(draftUnitId);
    expect(result!.unitName).toBe("Mechanics");
    expect(result!.lessons).toHaveLength(2);

    const lesson1 = result!.lessons.find((l) => l.draftLessonId === lessonId1);
    expect(lesson1).toMatchObject({
      title: "Newton's Second Law",
      conceptCount: 3,
      assessmentCount: 1,
    });

    const lesson2 = result!.lessons.find((l) => l.draftLessonId === lessonId2);
    expect(lesson2).toMatchObject({
      title: "Forces in Nature",
      conceptCount: 1,
      assessmentCount: 0,
    });

    svc.shutdown();
  });
});

// ─── getLessonDetail ──────────────────────────────────────────────────────────

describe("CourseCreateServiceImpl.getLessonDetail", () => {
  const dbCtx = useTempDb();

  it("returns null for unknown draftId", async () => {
    const { svc } = makeService(dbCtx.dbPath);
    const result = await svc.getLessonDetail({
      draftId: "nonexistent",
      draftLessonId: "any",
    });
    expect(result).toBeNull();
    svc.shutdown();
  });

  it("returns null for unknown draftLessonId within an existing draft", async () => {
    const { svc } = makeService(dbCtx.dbPath);
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Test",
      subject: "math",
      gradeLevel: "9",
    });
    const result = await svc.getLessonDetail({ draftId, draftLessonId: "ghost-lesson" });
    expect(result).toBeNull();
    svc.shutdown();
  });

  it("returns full detail including concepts, assessments, and parentUnit", async () => {
    const { svc } = makeService(dbCtx.dbPath);
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Chemistry",
      subject: "chemistry",
      gradeLevel: "11",
    });

    await svc.addConcept({ draftId, name: "Atoms", description: "smallest unit" });
    await svc.addConcept({ draftId, name: "Molecules", description: "bonded atoms" });
    await svc.addLesson({
      draftId,
      title: "Atomic Structure",
      conceptNames: ["Atoms", "Molecules"],
      references: [],
    });

    const draft = await svc.showDraft(draftId);
    const lessonId = draft!.proposed.proposedLessons[0]!.draftLessonId;

    // Add a lesson assessment.
    await svc.addLessonAssessment({
      draftId,
      draftLessonId: lessonId,
      kind: "homework",
      timing: "after",
      purpose: "practice",
      conceptNames: ["Atoms"],
      rationale: "reinforce",
      title: "Atoms Homework",
    });

    // Put the lesson into a unit.
    const { draftUnitId } = (await svc.addUnit({
      draftId,
      name: "Fundamentals",
      draftLessonIds: [lessonId],
    })) as { ok: true; draftUnitId: string };

    const detail = await svc.getLessonDetail({ draftId, draftLessonId: lessonId });
    expect(detail).not.toBeNull();
    expect(detail!.draftLessonId).toBe(lessonId);
    expect(detail!.title).toBe("Atomic Structure");
    expect(detail!.conceptNames).toEqual(["Atoms", "Molecules"]);

    expect(detail!.assessments).toHaveLength(1);
    expect(detail!.assessments[0]).toMatchObject({
      kind: "homework",
      timing: "after",
      purpose: "practice",
      title: "Atoms Homework",
    });

    expect(detail!.parentUnit).toMatchObject({
      draftUnitId,
      name: "Fundamentals",
    });

    svc.shutdown();
  });

  it("returns null parentUnit when lesson is not in any unit", async () => {
    const { svc } = makeService(dbCtx.dbPath);
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Solo Lesson",
      subject: "art",
      gradeLevel: "8",
    });

    await svc.addConcept({ draftId, name: "Color", description: "hue and saturation" });
    await svc.addLesson({
      draftId,
      title: "Color Theory",
      conceptNames: ["Color"],
      references: [],
    });

    const draft = await svc.showDraft(draftId);
    const lessonId = draft!.proposed.proposedLessons[0]!.draftLessonId;

    const detail = await svc.getLessonDetail({ draftId, draftLessonId: lessonId });
    expect(detail).not.toBeNull();
    expect(detail!.parentUnit).toBeNull();
    svc.shutdown();
  });
});

// ─── listDanglingRefs ─────────────────────────────────────────────────────────

describe("CourseCreateServiceImpl.listDanglingRefs", () => {
  const dbCtx = useTempDb();

  it("returns null for unknown draftId", async () => {
    const { svc } = makeService(dbCtx.dbPath);
    const result = await svc.listDanglingRefs("nonexistent-draft");
    expect(result).toBeNull();
    svc.shutdown();
  });

  it("returns all-empty report for a clean draft", async () => {
    const { svc } = makeService(dbCtx.dbPath);
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Clean Draft",
      subject: "math",
      gradeLevel: "9",
    });

    await svc.addConcept({ draftId, name: "Slope", description: "rise over run" });
    await svc.addLesson({
      draftId,
      title: "Slope Intro",
      conceptNames: ["Slope"],
      references: [],
    });

    const report = await svc.listDanglingRefs(draftId);
    expect(report).not.toBeNull();
    expect(report!.orphanConcepts).toEqual([]);
    expect(report!.danglingUnitMemberships).toEqual([]);
    expect(report!.danglingLessonAssessments).toEqual([]);
    expect(report!.edgesReferencingUnknownConcepts).toEqual([]);
    svc.shutdown();
  });

  it("detects orphan concepts (concept in graph but not in any lesson)", async () => {
    const { svc } = makeService(dbCtx.dbPath);
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Orphan Test",
      subject: "math",
      gradeLevel: "9",
    });

    await svc.addConcept({ draftId, name: "Vectors", description: "direction + magnitude" });
    await svc.addConcept({ draftId, name: "Scalars", description: "magnitude only" });
    // Only Vectors is referenced by a lesson; Scalars is orphaned.
    await svc.addLesson({
      draftId,
      title: "Vector Basics",
      conceptNames: ["Vectors"],
      references: [],
    });

    const report = await svc.listDanglingRefs(draftId);
    expect(report!.orphanConcepts).toEqual(["Scalars"]);
    expect(report!.danglingUnitMemberships).toEqual([]);
    expect(report!.danglingLessonAssessments).toEqual([]);
    svc.shutdown();
  });

  it("detects dangling unit memberships (unit references a removed lesson id)", async () => {
    // addUnit validates lesson ids so we can't use the public API to create a dangling membership.
    // Inject the dangling state directly into the store instead.
    const { svc, store } = makeService(dbCtx.dbPath);
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Dangling Unit Test",
      subject: "math",
      gradeLevel: "9",
    });

    await svc.addConcept({ draftId, name: "Ratios", description: "ratio concept" });
    await svc.addLesson({
      draftId,
      title: "Ratio Intro",
      conceptNames: ["Ratios"],
      references: [],
    });

    const draft = await svc.showDraft(draftId);
    const lessonId = draft!.proposed.proposedLessons[0]!.draftLessonId;
    const ghostId = "ghost-lesson-abc";
    const now = Date.now() as Timestamp;

    // Inject a unit that references both the real lesson id and the ghost.
    const draftWithDanglingUnit: DraftCourseState = {
      ...draft!,
      lastTouchedAt: now,
      proposed: {
        ...draft!.proposed,
        proposedUnits: [
          {
            draftUnitId: "unit-dangling",
            name: "Math Basics",
            draftLessonIds: [lessonId, ghostId],
          },
        ],
      },
    };
    store.save(draftWithDanglingUnit);

    const report = await svc.listDanglingRefs(draftId);
    expect(report!.danglingUnitMemberships).toHaveLength(1);
    expect(report!.danglingUnitMemberships[0]).toMatchObject({
      unitName: "Math Basics",
      badLessonIds: [ghostId],
    });
    svc.shutdown();
  });

  it("detects dangling lesson assessments (assessment references a removed lesson)", async () => {
    // inject the dangling state directly into the store — remove-lesson normally cascades
    // to clean up assessments, so we bypass the public API here.
    const { svc, store } = makeService(dbCtx.dbPath);
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Dangling Assessment Test",
      subject: "science",
      gradeLevel: "10",
    });

    await svc.addConcept({ draftId, name: "Gravity", description: "attractive force" });
    await svc.addLesson({
      draftId,
      title: "Gravity Lesson",
      conceptNames: ["Gravity"],
      references: [],
    });

    const draft = await svc.showDraft(draftId);
    const lessonId = draft!.proposed.proposedLessons[0]!.draftLessonId;

    // Inject a lesson assessment referencing a non-existent lesson id directly into the store.
    const ghostLessonId = "ghost-lesson-for-assessment";
    const now = Date.now() as Timestamp;
    const draftWithDanglingAssessment: DraftCourseState = {
      ...draft!,
      lastTouchedAt: now,
      proposed: {
        ...draft!.proposed,
        proposedLessonAssessments: [
          {
            draftLessonId: ghostLessonId,
            draftAssessmentId: "assessment-dangling-1",
            kind: "quiz",
            timing: "after",
            purpose: "practice",
            conceptNames: ["Gravity"],
            rationale: "check understanding",
            title: "Gravity Quiz",
          },
        ],
      },
    };
    store.save(draftWithDanglingAssessment);

    const report = await svc.listDanglingRefs(draftId);
    expect(report!.danglingLessonAssessments).toHaveLength(1);
    expect(report!.danglingLessonAssessments[0]!.badLessonId).toBe(ghostLessonId);

    // The real lesson id (lessonId) is still present — not dangling.
    expect(report!.danglingLessonAssessments[0]!.draftAssessmentId).toBe("assessment-dangling-1");
    svc.shutdown();
  });

  it("detects edges referencing unknown concepts", async () => {
    // inject the dangling state directly into the store — remove-concept normally cascades
    // to clean up edges, so we bypass the public API here.
    const { svc, store } = makeService(dbCtx.dbPath);
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Edge Integrity Test",
      subject: "cs",
      gradeLevel: "12",
    });

    await svc.addConcept({ draftId, name: "Functions", description: "named code blocks" });
    await svc.addLesson({
      draftId,
      title: "Functions Lesson",
      conceptNames: ["Functions"],
      references: [],
    });

    const draft = await svc.showDraft(draftId);
    // Inject an edge referencing a concept name "Loops" that does not exist.
    const now = Date.now() as Timestamp;
    const draftWithDanglingEdge: DraftCourseState = {
      ...draft!,
      lastTouchedAt: now,
      proposed: {
        ...draft!.proposed,
        proposedEdges: [
          {
            fromName: "Functions",
            toName: "Loops",
            strength: 0.7,
            rationale: "loops use functions",
          },
        ],
      },
    };
    store.save(draftWithDanglingEdge);

    const report = await svc.listDanglingRefs(draftId);
    expect(report!.edgesReferencingUnknownConcepts).toHaveLength(1);
    expect(report!.edgesReferencingUnknownConcepts[0]).toMatchObject({
      fromName: "Functions",
      toName: "Loops",
    });
    svc.shutdown();
  });
});
