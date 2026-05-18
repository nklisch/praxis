/**
 * Tests for the course.list_lessons_in_unit tool handler.
 */
import type { CourseCreateService } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { listLessonsInUnitTool } from "../list-lessons-in-unit.js";

const LESSONS_FIXTURE = {
  draftUnitId: "unit-1",
  unitName: "Mechanics",
  lessons: [
    { draftLessonId: "l1", title: "Forces", conceptCount: 3, assessmentCount: 1 },
    { draftLessonId: "l2", title: "Motion", conceptCount: 2, assessmentCount: 0 },
  ],
};

describe("course.list_lessons_in_unit handler", () => {
  it("returns lessons for a valid unit", async () => {
    const bootstrap: Partial<CourseCreateService> = {
      listLessonsInUnit: vi.fn().mockResolvedValue(LESSONS_FIXTURE),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as CourseCreateService },
      draftId: "draft-1",
    });

    const result = await listLessonsInUnitTool.handler(
      { draftId: "draft-1", draftUnitId: "unit-1" },
      ctx,
    );

    expect(result.draftUnitId).toBe("unit-1");
    expect(result.unitName).toBe("Mechanics");
    expect(result.lessons).toHaveLength(2);
    expect(bootstrap.listLessonsInUnit).toHaveBeenCalledWith({
      draftId: "draft-1",
      draftUnitId: "unit-1",
    });
  });

  it("uses ctx.draftId when args.draftId is not provided", async () => {
    const bootstrap: Partial<CourseCreateService> = {
      listLessonsInUnit: vi.fn().mockResolvedValue(LESSONS_FIXTURE),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as CourseCreateService },
      draftId: "ctx-draft",
    });

    await listLessonsInUnitTool.handler(
      { draftId: undefined as unknown as string, draftUnitId: "u1" },
      ctx,
    );

    expect(bootstrap.listLessonsInUnit).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: "ctx-draft" }),
    );
  });

  it("throws when draft or unit does not exist — locks the throw-contract chosen over empty+warning to distinguish 'caller error' from 'legitimate empty state'", async () => {
    const bootstrap: Partial<CourseCreateService> = {
      listLessonsInUnit: vi.fn().mockResolvedValue(null),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as CourseCreateService },
      draftId: "d1",
    });

    await expect(
      listLessonsInUnitTool.handler({ draftId: "d1", draftUnitId: "ghost-unit" }, ctx),
    ).rejects.toThrow(/ghost-unit/);
  });

  it("throws when no draftId is available", async () => {
    const bootstrap: Partial<CourseCreateService> = {
      listLessonsInUnit: vi.fn(),
    };
    const ctx = makeToolContext({ services: { bootstrap: bootstrap as CourseCreateService } });

    await expect(
      listLessonsInUnitTool.handler(
        { draftId: undefined as unknown as string, draftUnitId: "u1" },
        ctx,
      ),
    ).rejects.toThrow(/draftId is required/);
    expect(bootstrap.listLessonsInUnit).not.toHaveBeenCalled();
  });

  it("has correct name, tier, and effects", () => {
    expect(listLessonsInUnitTool.name).toBe("course.list_lessons_in_unit");
    expect(listLessonsInUnitTool.tier).toBe("grounded");
    expect(listLessonsInUnitTool.effects).toContain("none");
  });
});
