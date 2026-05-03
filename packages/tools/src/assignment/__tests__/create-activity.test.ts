/**
 * Tests that assignment.create posts an activity-rail entry with correct metadata.
 *
 * Phase 16: when the tool handler succeeds, it fires activity.start().finish("done")
 * so the renderer can react (e.g. auto-open the quiz tab).
 */

import type { ActivityHandle, ActivityRegistry, AssignmentService } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { createAssignmentTool } from "../create.js";

const COURSE_ID = brandId<"CourseId">("course-activity-test");
const ASSIGNMENT_ID = brandId<"AssignmentId">("assign-activity-test");
const SESSION_ID = "session-activity-test";

function makeAssignmentsService(): AssignmentService {
  return {
    create: vi.fn().mockResolvedValue({ assignmentId: ASSIGNMENT_ID }),
    get: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    recordResponse: vi.fn().mockResolvedValue(undefined),
    getResponses: vi.fn().mockResolvedValue([]),
    submit: vi.fn().mockResolvedValue({}),
  };
}

function makeActivityRegistry(): ActivityRegistry & {
  startCalls: Array<Parameters<ActivityRegistry["start"]>[0]>;
} {
  const startCalls: Array<Parameters<ActivityRegistry["start"]>[0]> = [];
  const handle: ActivityHandle = {
    id: "test-activity-handle",
    update: vi.fn(),
    finish: vi.fn(),
  };
  const registry: ActivityRegistry & {
    startCalls: typeof startCalls;
  } = {
    startCalls,
    start: vi.fn().mockImplementation((input) => {
      startCalls.push(input);
      return handle;
    }),
    subscribe: vi.fn(),
    dismiss: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    shutdown: vi.fn(),
  };
  return registry;
}

const QUIZ_ITEMS = [
  {
    id: "item-1",
    kind: "multiple-choice" as const,
    prompt: "What is 2+2?",
    options: ["3", "4"],
    correctOptionIndex: 1,
  },
];

describe("createAssignmentTool — activity rail", () => {
  let assignments: AssignmentService;
  let activity: ReturnType<typeof makeActivityRegistry>;

  beforeEach(() => {
    assignments = makeAssignmentsService();
    activity = makeActivityRegistry();
  });

  it("posts an activity entry after successful create", async () => {
    const ctx = makeToolContext({
      sessionId: SESSION_ID,
      services: { assignments, activity },
    });

    await createAssignmentTool.handler(
      {
        courseId: COURSE_ID,
        kind: "quiz",
        title: "Algebra Quiz",
        items: QUIZ_ITEMS,
        conceptIds: [],
      },
      ctx,
    );

    expect(activity.start).toHaveBeenCalledTimes(1);
    const startArg = activity.startCalls[0];
    expect(startArg).toBeDefined();
    expect(startArg?.id).toBe(`assignment-issued-${ASSIGNMENT_ID}`);
    expect(startArg?.label).toContain("quiz issued");
    expect(startArg?.label).toContain("algebra quiz");
    expect(startArg?.lingerMs).toBe(60_000);
  });

  it("activity entry metadata carries assignmentId, parentSessionId, courseId, and kind", async () => {
    const ctx = makeToolContext({
      sessionId: SESSION_ID,
      services: { assignments, activity },
    });

    await createAssignmentTool.handler(
      {
        courseId: COURSE_ID,
        kind: "homework",
        title: "HW 1",
        items: QUIZ_ITEMS,
        conceptIds: [],
      },
      ctx,
    );

    const startArg = activity.startCalls[0];
    expect(startArg?.metadata).toMatchObject({
      kind: "assignment.issued",
      assignmentId: ASSIGNMENT_ID,
      parentSessionId: brandId<"SessionId">(SESSION_ID),
      courseId: COURSE_ID,
    });
  });

  it("does not throw when activity service is absent (optional dep)", async () => {
    const ctx = makeToolContext({
      sessionId: SESSION_ID,
      services: { assignments },
      // activity not wired
    });

    await expect(
      createAssignmentTool.handler(
        {
          courseId: COURSE_ID,
          kind: "quiz",
          title: "No-activity quiz",
          items: QUIZ_ITEMS,
          conceptIds: [],
        },
        ctx,
      ),
    ).resolves.toMatchObject({ ok: true });
  });
});
