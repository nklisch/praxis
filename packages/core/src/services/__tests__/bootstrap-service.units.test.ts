/**
 * Unit tests for BootstrapServiceImpl — Phase 16 unit + assessment scaffold methods.
 *
 * Covers:
 *  - addUnit: unknown lesson rejected; happy path adds to draft
 *  - addUnit: unknown concept in summative rejected
 *  - setAssessmentPlan: round-trips the plan
 *  - addLessonAssessment: validates lesson refs + concept names
 *  - DraftSummary.unitCount and assessmentCount
 *  - validateProposed: new issue kinds (unit_unknown_lesson, assessment_unknown_concept, unit_lesson_not_in_draft)
 */
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { openDb } from "../../db/index.js";
import type { AssessmentPlan, Engine, StudentId, Timestamp } from "../../types/index.js";
import { brandId } from "../../types/index.js";
import { BootstrapServiceImpl } from "../bootstrap-service.js";
import { SqliteDraftStore } from "../draft-store.js";

const STUDENT_ID = brandId<"StudentId">("student-test") as StudentId;

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

// Each test gets a fresh DB + store so drafts don't bleed between tests.
const dbCtx = useTempDb();

function makeService() {
  const { db } = openDb({ path: dbCtx.dbPath });
  const store = new SqliteDraftStore(db);
  return {
    svc: new BootstrapServiceImpl({
      db,
      log: MOCK_LOG,
      engineResolver: makeEngine,
      courseDocuments: MOCK_COURSE_DOCUMENTS,
      sweepIntervalMs: 9999999,
      draftStore: store,
    }),
    store,
    db,
  };
}

/** Seed a draft with 2 concepts and 2 lessons, returns draftId and lessonIds. */
async function seedDraft(
  svc: BootstrapServiceImpl,
): Promise<{ draftId: string; lessonIds: string[] }> {
  const { draftId } = await svc.initDraft({
    studentId: STUDENT_ID,
    documentIds: [],
    courseTitle: "Algebra 1",
    subject: "math",
    gradeLevel: "9",
  });
  await svc.addConcept({ draftId, name: "Variables", description: "Symbols representing numbers" });
  await svc.addConcept({ draftId, name: "Equations", description: "Statements of equality" });
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
  // Load the draft to get the real lesson ids.
  const draft = await svc.showDraft(draftId);
  const lessonIds = draft?.proposed.proposedLessons.map((l) => l.draftLessonId) ?? [];
  return { draftId, lessonIds };
}

// ─── addUnit ─────────────────────────────────────────────────────────────────

describe("BootstrapServiceImpl.addUnit", () => {
  it("happy path: adds a unit with two lessons", async () => {
    const { svc } = makeService();
    const { draftId, lessonIds } = await seedDraft(svc);

    const result = await svc.addUnit({
      draftId,
      name: "Unit 1: Foundations",
      draftLessonIds: lessonIds,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error();
    expect(typeof result.draftUnitId).toBe("string");

    // Use public API to verify state.
    const draft = await svc.showDraft(draftId);
    expect(draft?.proposed.proposedUnits).toHaveLength(1);
    expect(draft?.proposed.proposedUnits?.[0]?.name).toBe("Unit 1: Foundations");
    expect(draft?.proposed.proposedUnits?.[0]?.draftLessonIds).toEqual(lessonIds);

    svc.shutdown();
  });

  it("rejects unknown draftLessonId", async () => {
    const { svc } = makeService();
    const { draftId, lessonIds } = await seedDraft(svc);

    const result = await svc.addUnit({
      draftId,
      name: "Bad Unit",
      draftLessonIds: [...lessonIds, "ghost-id"],
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    expect(result.reason).toContain("ghost-id");

    svc.shutdown();
  });

  it("rejects summative that references unknown concept", async () => {
    const { svc } = makeService();
    const { draftId, lessonIds } = await seedDraft(svc);

    const result = await svc.addUnit({
      draftId,
      name: "Unit with bad summative",
      draftLessonIds: lessonIds,
      summative: {
        kind: "exam",
        title: "Unit Exam",
        conceptNames: ["Variables", "NonExistentConcept"],
        rationale: "tests foundations",
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    expect(result.reason).toContain("NonExistentConcept");

    svc.shutdown();
  });

  it("materialises summative ProposedAssessment with a draftAssessmentId", async () => {
    const { svc } = makeService();
    const { draftId, lessonIds } = await seedDraft(svc);

    const result = await svc.addUnit({
      draftId,
      name: "Unit 1",
      draftLessonIds: lessonIds,
      summative: {
        kind: "exam",
        title: "Unit 1 Exam",
        conceptNames: ["Variables", "Equations"],
        rationale: "check unit mastery",
      },
    });

    expect(result.ok).toBe(true);
    const draft = await svc.showDraft(draftId);
    const unit = draft?.proposed.proposedUnits?.[0];
    expect(unit?.summative).toBeDefined();
    expect(typeof unit?.summative?.draftAssessmentId).toBe("string");
    expect(unit?.summative?.kind).toBe("exam");

    svc.shutdown();
  });

  it("returns ok:false for expired draft", async () => {
    const { svc } = makeService();
    const result = await svc.addUnit({
      draftId: "nonexistent",
      name: "x",
      draftLessonIds: [],
    });
    expect(result.ok).toBe(false);
    svc.shutdown();
  });
});

// ─── setAssessmentPlan ────────────────────────────────────────────────────────

describe("BootstrapServiceImpl.setAssessmentPlan", () => {
  it("stores the plan on the draft", async () => {
    const { svc } = makeService();
    const { draftId } = await seedDraft(svc);

    const plan: AssessmentPlan = {
      perLesson: { homework: true, quizFrequency: 3 },
      summatives: [
        { kind: "unit_exam", afterUnitOrderIndex: 0, title: "Unit 1 Exam" },
        { kind: "final", afterUnitOrderIndex: 1, title: "Final Exam" },
      ],
    };

    const result = await svc.setAssessmentPlan({ draftId, plan });
    expect(result.ok).toBe(true);

    const draft = await svc.showDraft(draftId);
    expect(draft?.proposed.assessmentPlan).toEqual(plan);

    svc.shutdown();
  });

  it("returns ok:false for unknown draft", async () => {
    const { svc } = makeService();
    const plan: AssessmentPlan = {
      perLesson: { homework: true },
      summatives: [],
    };
    const result = await svc.setAssessmentPlan({ draftId: "ghost", plan });
    expect(result.ok).toBe(false);
    svc.shutdown();
  });
});

// ─── addLessonAssessment ──────────────────────────────────────────────────────

describe("BootstrapServiceImpl.addLessonAssessment", () => {
  it("happy path: schedules a homework after lesson 1", async () => {
    const { svc } = makeService();
    const { draftId, lessonIds } = await seedDraft(svc);
    const lessonId = lessonIds[0];
    expect(lessonId).toBeDefined();

    const result = await svc.addLessonAssessment({
      draftId,
      // biome-ignore lint/style/noNonNullAssertion: seeded above
      draftLessonId: lessonId!,
      title: "Lesson 1 Homework",
      kind: "homework",
      timing: "after",
      purpose: "practice",
      conceptNames: ["Variables"],
      expectedItemCount: 6,
      rationale: "Practice variable identification",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error();
    expect(typeof result.draftAssessmentId).toBe("string");

    const draft = await svc.showDraft(draftId);
    expect(draft?.proposed.proposedLessonAssessments).toHaveLength(1);
    const la = draft?.proposed.proposedLessonAssessments?.[0];
    expect(la?.kind).toBe("homework");
    expect(la?.timing).toBe("after");
    expect(la?.purpose).toBe("practice");
    expect(la?.expectedItemCount).toBe(6);

    svc.shutdown();
  });

  it("rejects unknown draftLessonId", async () => {
    const { svc } = makeService();
    const { draftId } = await seedDraft(svc);

    const result = await svc.addLessonAssessment({
      draftId,
      draftLessonId: "ghost-lesson",
      title: "Quiz",
      kind: "quiz",
      timing: "after",
      purpose: "checkpoint",
      conceptNames: ["Variables"],
      rationale: "check",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    expect(result.reason).toContain("ghost-lesson");

    svc.shutdown();
  });

  it("rejects unknown concept name", async () => {
    const { svc } = makeService();
    const { draftId, lessonIds } = await seedDraft(svc);
    const lessonId = lessonIds[0];

    const result = await svc.addLessonAssessment({
      draftId,
      // biome-ignore lint/style/noNonNullAssertion: seeded above
      draftLessonId: lessonId!,
      title: "Quiz",
      kind: "quiz",
      timing: "after",
      purpose: "checkpoint",
      conceptNames: ["GhostConcept"],
      rationale: "check unknown concept",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    expect(result.reason).toContain("GhostConcept");

    svc.shutdown();
  });

  it("returns ok:false for unknown draft", async () => {
    const { svc } = makeService();
    const result = await svc.addLessonAssessment({
      draftId: "ghost",
      draftLessonId: "any",
      title: "Q",
      kind: "quiz",
      timing: "after",
      purpose: "checkpoint",
      conceptNames: ["Variables"],
      rationale: "x",
    });
    expect(result.ok).toBe(false);
    svc.shutdown();
  });
});

// ─── summarize — DraftSummary.unitCount / assessmentCount ─────────────────────

describe("BootstrapServiceImpl.summarize — DraftSummary unit/assessment counts", () => {
  it("returns unitCount=0 and assessmentCount=0 when no units or assessments", async () => {
    const { svc } = makeService();
    const { draftId } = await seedDraft(svc);

    const summary = await svc.summarize(draftId);
    expect(summary).not.toBeNull();
    if (!summary) throw new Error();
    expect(summary.unitCount).toBe(0);
    expect(summary.assessmentCount).toBe(0);

    svc.shutdown();
  });

  it("counts units and assessments in summary", async () => {
    const { svc } = makeService();
    const { draftId, lessonIds } = await seedDraft(svc);

    // Add a unit with a summative.
    await svc.addUnit({
      draftId,
      name: "Unit 1",
      draftLessonIds: lessonIds,
      summative: {
        kind: "exam",
        title: "Unit 1 Exam",
        conceptNames: ["Variables"],
        rationale: "unit mastery",
      },
    });

    // Add a per-lesson assessment.
    await svc.addLessonAssessment({
      draftId,
      // biome-ignore lint/style/noNonNullAssertion: seeded above
      draftLessonId: lessonIds[0]!,
      title: "Lesson 1 Homework",
      kind: "homework",
      timing: "after",
      purpose: "practice",
      conceptNames: ["Variables"],
      rationale: "practice",
    });

    const summary = await svc.summarize(draftId);
    expect(summary).not.toBeNull();
    if (!summary) throw new Error();
    expect(summary.unitCount).toBe(1);
    // 1 summative + 1 per-lesson = 2
    expect(summary.assessmentCount).toBe(2);

    svc.shutdown();
  });

  it("returns null for an unknown draftId", async () => {
    const { svc } = makeService();
    const summary = await svc.summarize("ghost-draft-id");
    expect(summary).toBeNull();
    svc.shutdown();
  });
});

// ─── validateProposed — surfaced via confirmDraft ────────────────────────────
//
// Validation now runs inside confirmDraft (no separate finalize step). Each of
// these checks injects an invalid state via the store directly (bypassing public
// API validation) then verifies confirmDraft surfaces the expected issue kind.

describe("BootstrapServiceImpl.confirmDraft — validation issue kinds", () => {
  it("issues unit_unknown_lesson when unit refs an unknown draftLessonId", async () => {
    const { svc, store } = makeService();
    const { draftId } = await seedDraft(svc);

    // Inject a unit with a bad lesson id directly via the store.
    const draft = store.load(draftId);
    expect(draft).not.toBeNull();
    if (!draft) throw new Error();
    draft.proposed.proposedUnits = [
      {
        draftUnitId: "u1",
        name: "Bad Unit",
        draftLessonIds: ["ghost-lesson-id"],
      },
    ];
    draft.lastTouchedAt = Date.now() as Timestamp;
    store.save(draft);

    const result = await svc.confirmDraft({ draftId, studentId: STUDENT_ID });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    const kinds = result.issues.map((i) => i.kind);
    expect(kinds).toContain("unit_unknown_lesson");

    svc.shutdown();
  });

  it("issues assessment_unknown_concept when unit summative refs unknown concept", async () => {
    const { svc, store } = makeService();
    const { draftId, lessonIds } = await seedDraft(svc);

    // Inject a unit with a summative referencing a nonexistent concept.
    const draft = store.load(draftId);
    expect(draft).not.toBeNull();
    if (!draft) throw new Error();
    draft.proposed.proposedUnits = [
      {
        draftUnitId: "u1",
        name: "Unit 1",
        // biome-ignore lint/style/noNonNullAssertion: lessonIds seeded above
        draftLessonIds: [lessonIds[0]!],
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

    const result = await svc.confirmDraft({ draftId, studentId: STUDENT_ID });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    const kinds = result.issues.map((i) => i.kind);
    expect(kinds).toContain("assessment_unknown_concept");

    svc.shutdown();
  });

  it("issues unit_lesson_not_in_draft when lesson assessment refs unknown lesson", async () => {
    const { svc, store } = makeService();
    const { draftId } = await seedDraft(svc);

    // Inject a bad lesson assessment directly via the store.
    const draft = store.load(draftId);
    expect(draft).not.toBeNull();
    if (!draft) throw new Error();
    draft.proposed.proposedLessonAssessments = [
      {
        draftAssessmentId: "a1",
        draftLessonId: "ghost-lesson",
        kind: "homework",
        timing: "after",
        purpose: "practice",
        title: "HW",
        conceptNames: ["Variables"],
        rationale: "x",
      },
    ];
    draft.lastTouchedAt = Date.now() as Timestamp;
    store.save(draft);

    const result = await svc.confirmDraft({ draftId, studentId: STUDENT_ID });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    const kinds = result.issues.map((i) => i.kind);
    expect(kinds).toContain("unit_lesson_not_in_draft");

    svc.shutdown();
  });
});
