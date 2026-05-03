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
import type {
  AssessmentPlan,
  Engine,
  ProposedCourse,
  StudentId,
  Timestamp,
} from "../../types/index.js";
import { brandId } from "../../types/index.js";
import { BootstrapServiceImpl } from "../bootstrap-service.js";

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

function makeService() {
  return new BootstrapServiceImpl({
    db: null as never,
    log: MOCK_LOG,
    engineResolver: makeEngine,
    courseDocuments: MOCK_COURSE_DOCUMENTS,
    sweepIntervalMs: 9999999,
  });
}

/** Seed a draft with 2 concepts and 2 lessons, returns draftId. */
async function seedDraft(svc: BootstrapServiceImpl): Promise<string> {
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
  return draftId;
}

function getDraftLessonIds(svc: BootstrapServiceImpl, draftId: string): string[] {
  // biome-ignore lint/suspicious/noExplicitAny: accessing private for test
  const draft = (svc as any).drafts.get(draftId);
  // biome-ignore lint/style/noNonNullAssertion: test setup guarantees it
  return draft!.proposed.proposedLessons.map((l: { draftLessonId: string }) => l.draftLessonId);
}

// ─── addUnit ─────────────────────────────────────────────────────────────────

describe("BootstrapServiceImpl.addUnit", () => {
  it("happy path: adds a unit with two lessons", async () => {
    const svc = makeService();
    const draftId = await seedDraft(svc);
    const lessonIds = getDraftLessonIds(svc, draftId);

    const result = await svc.addUnit({
      draftId,
      name: "Unit 1: Foundations",
      draftLessonIds: lessonIds,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error();
    expect(typeof result.draftUnitId).toBe("string");

    // biome-ignore lint/suspicious/noExplicitAny: accessing private for test
    const draft = (svc as any).drafts.get(draftId);
    expect(draft.proposed.proposedUnits).toHaveLength(1);
    expect(draft.proposed.proposedUnits[0].name).toBe("Unit 1: Foundations");
    expect(draft.proposed.proposedUnits[0].draftLessonIds).toEqual(lessonIds);

    svc.shutdown();
  });

  it("rejects unknown draftLessonId", async () => {
    const svc = makeService();
    const draftId = await seedDraft(svc);
    const lessonIds = getDraftLessonIds(svc, draftId);

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
    const svc = makeService();
    const draftId = await seedDraft(svc);
    const lessonIds = getDraftLessonIds(svc, draftId);

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
    const svc = makeService();
    const draftId = await seedDraft(svc);
    const lessonIds = getDraftLessonIds(svc, draftId);

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
    // biome-ignore lint/suspicious/noExplicitAny: accessing private for test
    const draft = (svc as any).drafts.get(draftId);
    const unit = draft.proposed.proposedUnits[0];
    expect(unit.summative).toBeDefined();
    expect(typeof unit.summative.draftAssessmentId).toBe("string");
    expect(unit.summative.kind).toBe("exam");

    svc.shutdown();
  });

  it("returns ok:false for expired draft", async () => {
    const svc = makeService();
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
    const svc = makeService();
    const draftId = await seedDraft(svc);

    const plan: AssessmentPlan = {
      perLesson: { homework: true, quizFrequency: 3 },
      summatives: [
        { kind: "unit_exam", afterUnitOrderIndex: 0, title: "Unit 1 Exam" },
        { kind: "final", afterUnitOrderIndex: 1, title: "Final Exam" },
      ],
    };

    const result = await svc.setAssessmentPlan({ draftId, plan });
    expect(result.ok).toBe(true);

    // biome-ignore lint/suspicious/noExplicitAny: accessing private for test
    const draft = (svc as any).drafts.get(draftId);
    expect(draft.proposed.assessmentPlan).toEqual(plan);

    svc.shutdown();
  });

  it("returns ok:false for unknown draft", async () => {
    const svc = makeService();
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
    const svc = makeService();
    const draftId = await seedDraft(svc);
    const [lessonId] = getDraftLessonIds(svc, draftId);

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

    // biome-ignore lint/suspicious/noExplicitAny: accessing private for test
    const draft = (svc as any).drafts.get(draftId);
    expect(draft.proposed.proposedLessonAssessments).toHaveLength(1);
    const la = draft.proposed.proposedLessonAssessments[0];
    expect(la.kind).toBe("homework");
    expect(la.timing).toBe("after");
    expect(la.purpose).toBe("practice");
    expect(la.expectedItemCount).toBe(6);

    svc.shutdown();
  });

  it("rejects unknown draftLessonId", async () => {
    const svc = makeService();
    const draftId = await seedDraft(svc);

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
    const svc = makeService();
    const draftId = await seedDraft(svc);
    const [lessonId] = getDraftLessonIds(svc, draftId);

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
    const svc = makeService();
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

// ─── DraftSummary.unitCount / assessmentCount ─────────────────────────────────

describe("BootstrapServiceImpl.finalizeDraft — DraftSummary unit/assessment counts", () => {
  it("returns unitCount=0 and assessmentCount=0 when no units or assessments", async () => {
    const svc = makeService();
    const draftId = await seedDraft(svc);

    const result = await svc.finalizeDraft({ draftId });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error();
    expect(result.summary.unitCount).toBe(0);
    expect(result.summary.assessmentCount).toBe(0);

    svc.shutdown();
  });

  it("counts units and assessments in summary", async () => {
    const svc = makeService();
    const draftId = await seedDraft(svc);
    const lessonIds = getDraftLessonIds(svc, draftId);

    // Add a unit with a summative.
    await svc.addUnit({
      draftId,
      name: "Unit 1",
      // biome-ignore lint/style/noNonNullAssertion: seeded above
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

    const result = await svc.finalizeDraft({ draftId });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error();
    expect(result.summary.unitCount).toBe(1);
    // 1 summative + 1 per-lesson = 2
    expect(result.summary.assessmentCount).toBe(2);

    svc.shutdown();
  });
});

// ─── validateProposed — new issue kinds ──────────────────────────────────────

describe("BootstrapServiceImpl.finalizeDraft — validation of new issue kinds", () => {
  it("issues unit_unknown_lesson when unit refs an unknown draftLessonId", async () => {
    const svc = makeService();
    // Bypass addUnit validation to inject a bad unit directly.
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Bad Course",
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

    // Inject a unit with a bad lesson id directly.
    // biome-ignore lint/suspicious/noExplicitAny: accessing private for test
    const draft = (svc as any).drafts.get(draftId);
    draft.proposed.proposedUnits = [
      {
        draftUnitId: "u1",
        name: "Bad Unit",
        draftLessonIds: ["ghost-lesson-id"],
      },
    ];

    const result = await svc.finalizeDraft({ draftId });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    const kinds = result.issues.map((i) => i.kind);
    expect(kinds).toContain("unit_unknown_lesson");

    svc.shutdown();
  });

  it("issues assessment_unknown_concept when unit summative refs unknown concept", async () => {
    const svc = makeService();
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Course",
      subject: "math",
      gradeLevel: "9",
    });
    await svc.addConcept({ draftId, name: "Variables", description: "x" });
    const lr = await svc.addLesson({
      draftId,
      title: "Lesson 1",
      conceptNames: ["Variables"],
      references: [],
    });
    if (!lr.ok) throw new Error();

    // Inject a unit with a summative referencing a nonexistent concept.
    // biome-ignore lint/suspicious/noExplicitAny: accessing private for test
    const draft = (svc as any).drafts.get(draftId);
    const lessonId = draft.proposed.proposedLessons[0].draftLessonId;
    draft.proposed.proposedUnits = [
      {
        draftUnitId: "u1",
        name: "Unit 1",
        draftLessonIds: [lessonId],
        summative: {
          draftAssessmentId: "a1",
          kind: "exam",
          title: "Exam",
          conceptNames: ["GhostConcept"],
          rationale: "x",
        },
      },
    ];

    const result = await svc.finalizeDraft({ draftId });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    const kinds = result.issues.map((i) => i.kind);
    expect(kinds).toContain("assessment_unknown_concept");

    svc.shutdown();
  });

  it("issues unit_lesson_not_in_draft when lesson assessment refs unknown lesson", async () => {
    const svc = makeService();
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Course",
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

    // Inject a bad lesson assessment directly.
    // biome-ignore lint/suspicious/noExplicitAny: accessing private for test
    const draft = (svc as any).drafts.get(draftId);
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

    const result = await svc.finalizeDraft({ draftId });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    const kinds = result.issues.map((i) => i.kind);
    expect(kinds).toContain("unit_lesson_not_in_draft");

    svc.shutdown();
  });
});
