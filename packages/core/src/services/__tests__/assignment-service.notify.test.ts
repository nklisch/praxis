/**
 * Tests for AssignmentServiceImpl.submit() — Phase 16 notifyParentSession port.
 *
 * These tests verify that:
 * 1. When an assignment has a parentSessionId and the service dep is wired, submit()
 *    fires the notifyParentSession callback with the right payload.
 * 2. When no parentSessionId is set on the assignment, the callback is NOT called.
 * 3. When the dep is omitted entirely, submit() still succeeds without throwing.
 */

import { courses } from "@praxis/artifacts/schema";
import { openDb } from "@praxis/core/db";
import { brandId } from "@praxis/core/types";
import { conceptGraphs } from "@praxis/curriculum/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import type {
  ConceptId,
  CourseId,
  Logger,
  SessionId,
  StudentId,
  SystemNoteOrigin,
} from "../../types/index.js";
import { AssignmentServiceImpl } from "../assignment-service.js";
import type { GraderServices } from "../graders/types.js";

const dbCtx = useTempDb();

const STUDENT = brandId<"StudentId">("student-notify-test") as StudentId;
const COURSE = brandId<"CourseId">("course-notify-test") as CourseId;
const PARENT_SESSION = brandId<"SessionId">("parent-session-notify") as SessionId;

function makeLog(): Logger {
  const log: Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => log),
  };
  return log;
}

/**
 * Minimal grader services — no LLM calls needed since we use short-answer items
 * with exact match grading (deterministic).
 */
function makeGraderServices(): GraderServices {
  return {
    // biome-ignore lint/suspicious/noExplicitAny: stub — deterministic short-answer grading never calls these
    sympy: undefined as any,
    // biome-ignore lint/suspicious/noExplicitAny: stub — deterministic short-answer grading never calls these
    sandbox: undefined as any,
    // biome-ignore lint/suspicious/noExplicitAny: stub — deterministic short-answer grading never calls engineResolver
    engineResolver: undefined as any,
  };
}

function makeMinimalItem() {
  return {
    id: "item-1",
    kind: "short-answer" as const,
    prompt: "What is 2 + 2?",
    acceptedAnswers: ["4"],
    acceptedAnswerMatch: "exact" as const,
  };
}

function seedCourse(db: ReturnType<typeof openDb>["db"]): void {
  try {
    db.insert(conceptGraphs)
      .values({
        id: "graph-notify-test",
        source: "extracted",
        name: "Notify Test Graph",
        version: "1",
        createdAt: new Date(),
      })
      .run();
  } catch {
    /* already seeded */
  }
  try {
    db.insert(courses)
      .values({
        id: COURSE,
        studentId: STUDENT,
        title: "Notify Test Course",
        subject: "math",
        gradeLevel: "9",
        sourceJson: { kind: "authored", authorRole: "teacher" },
        conceptGraphId: "graph-notify-test",
        thresholdsJson: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
  } catch {
    /* already seeded */
  }
}

describe("AssignmentServiceImpl.submit — notifyParentSession", () => {
  let db: ReturnType<typeof openDb>["db"];

  beforeEach(() => {
    ({ db } = openDb({ path: dbCtx.dbPath }));
    seedCourse(db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls notifyParentSession when assignment has a parentSessionId", async () => {
    const notifySpy = vi.fn().mockResolvedValue(undefined);
    const svc = new AssignmentServiceImpl({
      db,
      log: makeLog(),
      graderServices: makeGraderServices(),
      resolveSubmissionMode: () => "quiz",
      enableApproachFeedback: false,
      notifyParentSession: notifySpy,
    });

    const { assignmentId } = await svc.create({
      courseId: COURSE,
      studentId: STUDENT,
      kind: "quiz",
      title: "Notify test quiz",
      items: [makeMinimalItem()],
      conceptIds: [] as ConceptId[],
      parentSessionId: PARENT_SESSION,
    });

    await svc.recordResponse({
      assignmentId,
      itemId: "item-1",
      response: "4",
    });

    const submittingSession = brandId<"SessionId">("child-session-notify") as SessionId;
    const result = await svc.submit({
      assignmentId,
      submittingSessionId: submittingSession,
    });

    expect(result.grade).toBeDefined();
    // Notification fires asynchronously (fire-and-forget) — flush microtasks.
    await new Promise((r) => setTimeout(r, 10));
    expect(notifySpy).toHaveBeenCalledTimes(1);

    const callArg = notifySpy.mock.calls[0]?.[0] as {
      parentSessionId: SessionId;
      note: string;
      origin: SystemNoteOrigin;
    };
    expect(callArg.parentSessionId).toBe(PARENT_SESSION);
    expect(typeof callArg.note).toBe("string");
    expect(callArg.note).toContain("Notify test quiz");
    expect(callArg.origin.kind).toBe("assignment_submission");
    if (callArg.origin.kind === "assignment_submission") {
      expect(callArg.origin.assignmentId).toBe(assignmentId);
      expect(callArg.origin.childSessionId).toBe(submittingSession);
      expect(typeof callArg.origin.gradeTotal).toBe("number");
    }
  });

  it("does NOT call notifyParentSession when assignment has no parentSessionId", async () => {
    const notifySpy = vi.fn().mockResolvedValue(undefined);
    const svc = new AssignmentServiceImpl({
      db,
      log: makeLog(),
      graderServices: makeGraderServices(),
      resolveSubmissionMode: () => "quiz",
      enableApproachFeedback: false,
      notifyParentSession: notifySpy,
    });

    const { assignmentId } = await svc.create({
      courseId: COURSE,
      studentId: STUDENT,
      kind: "quiz",
      title: "No-parent quiz",
      items: [makeMinimalItem()],
      conceptIds: [] as ConceptId[],
      // no parentSessionId
    });

    await svc.recordResponse({ assignmentId, itemId: "item-1", response: "4" });
    await svc.submit({ assignmentId });

    await new Promise((r) => setTimeout(r, 10));
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it("succeeds without throwing when notifyParentSession dep is not provided", async () => {
    const svc = new AssignmentServiceImpl({
      db,
      log: makeLog(),
      graderServices: makeGraderServices(),
      resolveSubmissionMode: () => "quiz",
      enableApproachFeedback: false,
      // notifyParentSession omitted intentionally
    });

    const { assignmentId } = await svc.create({
      courseId: COURSE,
      studentId: STUDENT,
      kind: "quiz",
      title: "No-notify quiz",
      items: [makeMinimalItem()],
      conceptIds: [] as ConceptId[],
      parentSessionId: PARENT_SESSION, // parentSessionId is set but dep is absent
    });

    await svc.recordResponse({ assignmentId, itemId: "item-1", response: "4" });
    const result = await svc.submit({ assignmentId });
    expect(result.grade.total).toBeGreaterThanOrEqual(0);
  });

  it("logs a warning and does not throw when notifyParentSession rejects", async () => {
    const log = makeLog();
    const notifySpy = vi.fn().mockRejectedValue(new Error("notify failed"));
    const svc = new AssignmentServiceImpl({
      db,
      log,
      graderServices: makeGraderServices(),
      resolveSubmissionMode: () => "quiz",
      enableApproachFeedback: false,
      notifyParentSession: notifySpy,
    });

    const { assignmentId } = await svc.create({
      courseId: COURSE,
      studentId: STUDENT,
      kind: "quiz",
      title: "Failing notify quiz",
      items: [makeMinimalItem()],
      conceptIds: [] as ConceptId[],
      parentSessionId: PARENT_SESSION,
    });

    await svc.recordResponse({ assignmentId, itemId: "item-1", response: "4" });
    // Should not throw even though notify rejects
    await expect(svc.submit({ assignmentId })).resolves.toBeDefined();

    // Flush microtasks so the fire-and-forget rejection is caught
    await new Promise((r) => setTimeout(r, 20));
    expect(log.warn).toHaveBeenCalledWith(
      "assignment.submit.notify_failed",
      expect.objectContaining({ assignmentId }),
    );
  });
});
