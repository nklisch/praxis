/**
 * Integration tests for BootstrapServiceImpl.confirmDraft — Phase 16 unit +
 * assessment materialisation.
 *
 * Uses a real temp DB (via useTempDb) to verify all rows are created correctly.
 *
 * Covers:
 *  - Units + lesson_units join rows are written
 *  - summativeAssignmentId is set when a summative is present
 *  - Summative assignment shells have items:[] and submittedAt:null
 *  - Per-lesson assessment shells + lesson_assessments join rows
 *  - courses.assessment_plan_json is written
 *  - FK integrity: unknown concept in assessment → validation short-circuits (no half-built course)
 */
import { assignments, courseUnits, lessonAssessments, lessonUnits } from "@praxis/artifacts/schema";
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { openDb } from "../../db/index.js";
import type { AssessmentPlan, Engine, Timestamp } from "../../types/index.js";
import { brandId } from "../../types/index.js";
import { BootstrapServiceImpl } from "../bootstrap-service.js";
import { SqliteDraftStore } from "../draft-store.js";

const STUDENT_ID = brandId<"StudentId">("student-persist-units");

const MOCK_LOG = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => MOCK_LOG),
};

const MOCK_COURSE_DOCUMENTS = {
  listForCourse: vi.fn().mockResolvedValue([]),
  listForCourseDetailed: vi.fn().mockResolvedValue([]),
  attach: vi.fn().mockResolvedValue({ attached: true }),
  detach: vi.fn().mockResolvedValue({ detached: true }),
  attachMany: vi.fn().mockResolvedValue({ newlyAttached: [] }),
};

function makeEngine(): Engine {
  return { open: vi.fn() } as unknown as Engine;
}

// ─── DB persistence tests ─────────────────────────────────────────────────────

describe("BootstrapServiceImpl.confirmDraft — units + assessments", () => {
  const dbCtx = useTempDb();

  it("materialises course_units, lesson_units, and assessment shells", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const store = new SqliteDraftStore(db);
    const svc = new BootstrapServiceImpl({
      db,
      log: MOCK_LOG,
      engineResolver: makeEngine,
      courseDocuments: MOCK_COURSE_DOCUMENTS,
      sweepIntervalMs: 9999999,
      draftStore: store,
    });

    // Build a draft with 2 lessons, 1 unit, 1 summative, 1 per-lesson assessment.
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Algebra 1",
      subject: "math",
      gradeLevel: "9",
    });

    await svc.addConcept({ draftId, name: "Variables", description: "symbols" });
    await svc.addConcept({ draftId, name: "Equations", description: "equality" });

    const r1 = await svc.addLesson({
      draftId,
      title: "Intro to Variables",
      conceptNames: ["Variables"],
      references: [],
    });
    const r2 = await svc.addLesson({
      draftId,
      title: "Writing Equations",
      conceptNames: ["Equations"],
      references: [],
    });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    // Read lesson ids via the public API.
    const draft = await svc.showDraft(draftId);
    expect(draft).not.toBeNull();
    const [l1Id, l2Id] = draft?.proposed.proposedLessons.map((l) => l.draftLessonId) ?? [];

    const plan: AssessmentPlan = {
      perLesson: { homework: true, quizFrequency: 2 },
      summatives: [{ kind: "final", afterUnitOrderIndex: 0, title: "Final Exam" }],
    };
    await svc.setAssessmentPlan({ draftId, plan });

    const unitResult = await svc.addUnit({
      draftId,
      name: "Unit 1: Foundations",
      // biome-ignore lint/style/noNonNullAssertion: seeded above
      draftLessonIds: [l1Id!, l2Id!],
      summative: {
        kind: "exam",
        title: "Unit 1 Exam",
        conceptNames: ["Variables", "Equations"],
        expectedItemCount: 10,
        rationale: "Check unit mastery",
      },
    });
    expect(unitResult.ok).toBe(true);

    const laResult = await svc.addLessonAssessment({
      draftId,
      // biome-ignore lint/style/noNonNullAssertion: seeded above
      draftLessonId: l1Id!,
      title: "Lesson 1 Homework",
      kind: "homework",
      timing: "after",
      purpose: "practice",
      conceptNames: ["Variables"],
      expectedItemCount: 6,
      rationale: "Practice variables",
    });
    expect(laResult.ok).toBe(true);

    // Confirm draft — should persist everything.
    const result = await svc.confirmDraft({ draftId, studentId: STUDENT_ID });
    if (!result.ok)
      throw new Error(`expected ok:true, got issues: ${JSON.stringify(result.issues)}`);
    const { courseId } = result;
    expect(typeof courseId).toBe("string");

    // Verify course_units row.
    const unitRows = db.select().from(courseUnits).all();
    expect(unitRows).toHaveLength(1);
    const unitRow = unitRows[0];
    expect(unitRow?.name).toBe("Unit 1: Foundations");
    expect(unitRow?.orderIndex).toBe(0);
    expect(unitRow?.courseId).toBe(courseId);
    // summativeAssignmentId should be set.
    expect(unitRow?.summativeAssignmentId).toBeTruthy();

    // Verify lesson_units join rows.
    const luRows = db.select().from(lessonUnits).all();
    expect(luRows).toHaveLength(2); // both lessons linked to unit

    // Verify summative assignment shell.
    const allAssignments = db.select().from(assignments).all();
    // 1 summative + 1 per-lesson homework = 2 assignments
    expect(allAssignments).toHaveLength(2);

    const summative = allAssignments.find((a) => a.id === unitRow?.summativeAssignmentId);
    expect(summative).toBeDefined();
    expect(summative?.kind).toBe("exam");
    expect(summative?.title).toBe("Unit 1 Exam");
    expect(summative?.submittedAt).toBeNull();
    expect(summative?.gradeJson).toBeNull();
    expect(summative?.parentSessionId).toBeNull();
    // itemsJson should be empty array
    expect(summative?.itemsJson).toEqual([]);

    // Verify per-lesson assessment.
    const laRows = db.select().from(lessonAssessments).all();
    expect(laRows).toHaveLength(1);
    const laRow = laRows[0];
    expect(laRow?.timing).toBe("after");
    expect(laRow?.purpose).toBe("practice");

    // Verify homework assignment shell.
    const hw = allAssignments.find((a) => a.id === laRow?.assignmentId);
    expect(hw).toBeDefined();
    expect(hw?.kind).toBe("homework");
    expect(hw?.itemsJson).toEqual([]);

    // Verify courses.assessment_plan_json is written.
    const courseData = db.get<{ assessment_plan_json: string }>(
      `SELECT assessment_plan_json FROM courses WHERE id = '${courseId}'`,
    );
    expect(courseData?.assessment_plan_json).toBeTruthy();
    const parsedPlan = JSON.parse(courseData?.assessment_plan_json ?? "null");
    expect(parsedPlan?.perLesson?.homework).toBe(true);
    expect(parsedPlan?.summatives).toHaveLength(1);

    svc.shutdown();
  });

  it("materialises nothing extra when no units or assessments in draft", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = new BootstrapServiceImpl({
      db,
      log: MOCK_LOG,
      engineResolver: makeEngine,
      courseDocuments: MOCK_COURSE_DOCUMENTS,
      sweepIntervalMs: 9999999,
    });

    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Minimal Course",
      subject: "math",
      gradeLevel: "9",
    });
    await svc.addConcept({ draftId, name: "Basics", description: "fundamentals" });
    await svc.addLesson({
      draftId,
      title: "Lesson 1",
      conceptNames: ["Basics"],
      references: [],
    });

    const noUnitsResult = await svc.confirmDraft({ draftId, studentId: STUDENT_ID });
    expect(noUnitsResult.ok).toBe(true);

    // No units or assessments.
    const unitRows = db.select().from(courseUnits).all();
    const laRows = db.select().from(lessonAssessments).all();
    const luRows = db.select().from(lessonUnits).all();
    expect(unitRows).toHaveLength(0);
    expect(laRows).toHaveLength(0);
    expect(luRows).toHaveLength(0);

    svc.shutdown();
  });

  it("returns issues without persisting when assessment refs unknown concept", async () => {
    // Validation runs inside confirmDraft BEFORE the persist transaction
    // opens, so a malformed draft never produces partial rows. The test asserts
    // the same end-state guarantee (no committed rows) via the new
    // discriminated-union shape rather than a throw.
    const { db } = openDb({ path: dbCtx.dbPath });
    const store = new SqliteDraftStore(db);
    const svc = new BootstrapServiceImpl({
      db,
      log: MOCK_LOG,
      engineResolver: makeEngine,
      courseDocuments: MOCK_COURSE_DOCUMENTS,
      sweepIntervalMs: 9999999,
      draftStore: store,
    });

    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Rollback Course",
      subject: "math",
      gradeLevel: "9",
    });
    await svc.addConcept({ draftId, name: "Variables", description: "x" });
    await svc.addLesson({
      draftId,
      title: "Lesson 1",
      conceptNames: ["Variables"],
      references: [],
    });

    // Inject a unit with an assessment that refs a ghost concept via the store
    // (bypassing method-level validation).
    const draft = store.load(draftId);
    expect(draft).not.toBeNull();
    if (!draft) throw new Error();
    const lessonId = draft.proposed.proposedLessons[0]?.draftLessonId;
    draft.proposed.proposedUnits = [
      {
        draftUnitId: "u1",
        name: "Unit 1",
        // biome-ignore lint/style/noNonNullAssertion: seeded above
        draftLessonIds: [lessonId!],
        summative: {
          draftAssessmentId: "a1",
          kind: "exam",
          title: "Exam",
          conceptNames: ["GhostConcept"],
          rationale: "x",
        },
      },
    ];
    draft.lastTouchedAt = Date.now() as Timestamp;
    store.save(draft);

    const result = await svc.confirmDraft({ draftId: draftId, studentId: STUDENT_ID });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected ok:false");
    expect(result.issues.some((i) => /unknown.*concept/i.test(i.message))).toBe(true);

    // No courses should exist — validation short-circuited before the transaction.
    const count = db.get<{ n: number }>("SELECT COUNT(*) as n FROM courses");
    expect(count?.n).toBe(0);

    svc.shutdown();
  });
});
