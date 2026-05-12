/**
 * Tests for the course.get_lesson_detail tool handler.
 */
import type { BootstrapService } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { getLessonDetailTool } from "../get-lesson-detail.js";

const DETAIL_FIXTURE = {
  draftLessonId: "l1",
  title: "Atomic Structure",
  conceptNames: ["Atoms", "Molecules"],
  assessments: [
    {
      draftAssessmentId: "a1",
      kind: "homework" as const,
      timing: "after" as const,
      purpose: "practice" as const,
      title: "Atoms HW",
    },
  ],
  parentUnit: { draftUnitId: "unit-1", name: "Fundamentals" },
};

describe("course.get_lesson_detail handler", () => {
  it("returns lesson detail on success", async () => {
    const bootstrap: Partial<BootstrapService> = {
      getLessonDetail: vi.fn().mockResolvedValue(DETAIL_FIXTURE),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as BootstrapService },
      draftId: "draft-1",
    });

    const result = await getLessonDetailTool.handler(
      { draftId: "draft-1", draftLessonId: "l1" },
      ctx,
    );

    expect(result.draftLessonId).toBe("l1");
    expect(result.conceptNames).toEqual(["Atoms", "Molecules"]);
    expect(result.assessments).toHaveLength(1);
    expect(result.parentUnit).toMatchObject({ name: "Fundamentals" });
    expect(bootstrap.getLessonDetail).toHaveBeenCalledWith({
      draftId: "draft-1",
      draftLessonId: "l1",
    });
  });

  it("uses ctx.draftId when args.draftId is not provided", async () => {
    const bootstrap: Partial<BootstrapService> = {
      getLessonDetail: vi.fn().mockResolvedValue(DETAIL_FIXTURE),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as BootstrapService },
      draftId: "ctx-draft",
    });

    await getLessonDetailTool.handler(
      { draftId: undefined as unknown as string, draftLessonId: "l1" },
      ctx,
    );

    expect(bootstrap.getLessonDetail).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: "ctx-draft" }),
    );
  });

  it("throws when draft or lesson does not exist — locks the throw-contract chosen over empty+warning to distinguish 'caller error' from 'legitimate empty state'", async () => {
    const bootstrap: Partial<BootstrapService> = {
      getLessonDetail: vi.fn().mockResolvedValue(null),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as BootstrapService },
      draftId: "d1",
    });

    await expect(
      getLessonDetailTool.handler({ draftId: "d1", draftLessonId: "ghost-lesson" }, ctx),
    ).rejects.toThrow(/ghost-lesson/);
  });

  it("throws when no draftId is available", async () => {
    const bootstrap: Partial<BootstrapService> = {
      getLessonDetail: vi.fn(),
    };
    const ctx = makeToolContext({ services: { bootstrap: bootstrap as BootstrapService } });

    await expect(
      getLessonDetailTool.handler(
        { draftId: undefined as unknown as string, draftLessonId: "l1" },
        ctx,
      ),
    ).rejects.toThrow(/draftId is required/);
    expect(bootstrap.getLessonDetail).not.toHaveBeenCalled();
  });

  it("has correct name, tier, and effects", () => {
    expect(getLessonDetailTool.name).toBe("course.get_lesson_detail");
    expect(getLessonDetailTool.tier).toBe("grounded");
    expect(getLessonDetailTool.effects).toContain("none");
  });
});
