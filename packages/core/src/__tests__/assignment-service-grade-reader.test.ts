/**
 * Unit tests for AssignmentServiceImpl.readGrade() — Phase 9 GradeReader port.
 *
 * Uses a real temp DB (migrations via useTempDb).
 * Covers: null for nonexistent assignment, null for unsubmitted, grade for submitted.
 */
import { assignments, courses } from "@praxis/artifacts/schema";
import { conceptGraphs } from "@praxis/curriculum/schema";
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../tests/helpers/db-setup.js";
import { openDb } from "../db/index.js";
import { AssignmentServiceImpl } from "../services/assignment-service.js";
import { brandId } from "../types/index.js";

const STUDENT_ID = brandId<"StudentId">("student-grade-reader");
const COURSE_ID = brandId<"CourseId">("course-grade-reader");

const MOCK_LOG = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => MOCK_LOG),
};

const dbCtx = useTempDb();

function makeService(db: ReturnType<typeof openDb>["db"]) {
  return new AssignmentServiceImpl({
    db,
    log: MOCK_LOG,
    // biome-ignore lint/suspicious/noExplicitAny: stub — tests only call readGrade
    resolveSubmissionMode: () => "quiz" as any,
    // biome-ignore lint/suspicious/noExplicitAny: stub
    graderServices: {} as any,
  });
}

/** Seed a minimal course row (required by assignments FK). */
function seedCourse(db: ReturnType<typeof openDb>["db"]) {
  const graphId = "graph-grade-reader";
  db.insert(conceptGraphs)
    .values({ id: graphId, source: "extracted", name: "G", version: "1", createdAt: new Date() })
    .run();
  db.insert(courses)
    .values({
      id: COURSE_ID,
      studentId: STUDENT_ID,
      title: "Grade Reader Course",
      subject: "math",
      gradeLevel: "9",
      sourceJson: { kind: "bootstrapped", sourceMaterials: [] },
      conceptGraphId: graphId,
      thresholdsJson: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
}

describe("AssignmentServiceImpl.readGrade() — GradeReader port", () => {
  it("returns null for a nonexistent assignment", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    const result = await svc.readGrade({ assignmentId: "nonexistent" });
    expect(result).toBeNull();
  });

  it("returns null when assignment is not yet submitted", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    seedCourse(db);
    const svc = makeService(db);
    const id = "assign-not-submitted";

    db.insert(assignments)
      .values({
        id,
        courseId: COURSE_ID,
        kind: "quiz",
        title: "Test Quiz",
        itemsJson: [],
        conceptIdsJson: [],
        assignedAt: new Date(),
        // submittedAt: null (not submitted)
        // gradeJson: null
      })
      .run();

    const result = await svc.readGrade({ assignmentId: id });
    expect(result).toBeNull();
  });

  it("returns total and submittedAt when assignment has been graded", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    seedCourse(db);
    const svc = makeService(db);
    const id = "assign-graded";
    const submittedAt = new Date();

    db.insert(assignments)
      .values({
        id,
        courseId: COURSE_ID,
        kind: "quiz",
        title: "Graded Quiz",
        itemsJson: [],
        conceptIdsJson: [],
        assignedAt: new Date(),
        submittedAt,
        gradeJson: { total: 0.85, perItem: [] },
      })
      .run();

    const result = await svc.readGrade({ assignmentId: id });
    expect(result).not.toBeNull();
    expect(result?.total).toBeCloseTo(0.85, 4);
    expect(result?.submittedAt).toBe(submittedAt.getTime());
  });

  it("returns null when gradeJson is null even if submittedAt is set", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    seedCourse(db);
    const svc = makeService(db);
    const id = "assign-submitted-no-grade";

    db.insert(assignments)
      .values({
        id,
        courseId: COURSE_ID,
        kind: "quiz",
        title: "Submitted Without Grade",
        itemsJson: [],
        conceptIdsJson: [],
        assignedAt: new Date(),
        submittedAt: new Date(),
        gradeJson: null,
      })
      .run();

    const result = await svc.readGrade({ assignmentId: id });
    expect(result).toBeNull();
  });
});
