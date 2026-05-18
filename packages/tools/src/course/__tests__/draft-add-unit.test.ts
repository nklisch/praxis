/**
 * Unit tests for course.draft_add_unit tool handler.
 * Verifies ok/not-ok shapes, draftId resolution, and delegation to bootstrap service.
 */
import type { CourseCreateService } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { draftAddUnitTool } from "../draft-add-unit.js";

describe("course.draft_add_unit handler", () => {
  it("returns ok:true with draftUnitId on success", async () => {
    const bootstrap: Partial<CourseCreateService> = {
      addUnit: vi.fn().mockResolvedValue({ ok: true, draftUnitId: "unit-abc" }),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as CourseCreateService },
      draftId: "draft-1",
    });

    const result = await draftAddUnitTool.handler(
      { name: "Unit 1", draftLessonIds: ["l1", "l2"] },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error();
    expect(result.draftUnitId).toBe("unit-abc");
    expect(bootstrap.addUnit).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: "draft-1", name: "Unit 1" }),
    );
  });

  it("returns ok:false with reason when service rejects", async () => {
    const bootstrap: Partial<CourseCreateService> = {
      addUnit: vi.fn().mockResolvedValue({ ok: false, reason: "lesson not found" }),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as CourseCreateService },
      draftId: "draft-1",
    });

    const result = await draftAddUnitTool.handler(
      { name: "Bad Unit", draftLessonIds: ["ghost-id"] },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    expect(result.reason).toBe("lesson not found");
  });

  it("uses args.draftId over ctx.draftId when both provided", async () => {
    const bootstrap: Partial<CourseCreateService> = {
      addUnit: vi.fn().mockResolvedValue({ ok: true, draftUnitId: "u1" }),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as CourseCreateService },
      draftId: "ctx-draft",
    });

    await draftAddUnitTool.handler(
      { draftId: "arg-draft", name: "Unit", draftLessonIds: ["l1"] },
      ctx,
    );

    expect(bootstrap.addUnit).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: "arg-draft" }),
    );
  });

  it("returns ok:false when no draftId available", async () => {
    const bootstrap: Partial<CourseCreateService> = {
      addUnit: vi.fn(),
    };
    const ctx = makeToolContext({ services: { bootstrap: bootstrap as CourseCreateService } });

    const result = await draftAddUnitTool.handler({ name: "Unit", draftLessonIds: ["l1"] }, ctx);

    expect(result.ok).toBe(false);
    expect(bootstrap.addUnit).not.toHaveBeenCalled();
  });

  it("passes summative through to service", async () => {
    const bootstrap: Partial<CourseCreateService> = {
      addUnit: vi.fn().mockResolvedValue({ ok: true, draftUnitId: "u1" }),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as CourseCreateService },
      draftId: "d1",
    });

    await draftAddUnitTool.handler(
      {
        name: "Unit 1",
        draftLessonIds: ["l1"],
        summative: {
          kind: "exam",
          title: "Exam",
          conceptNames: ["Variables"],
          rationale: "check mastery",
        },
      },
      ctx,
    );

    expect(bootstrap.addUnit).toHaveBeenCalledWith(
      expect.objectContaining({
        summative: expect.objectContaining({ kind: "exam", title: "Exam" }),
      }),
    );
  });

  it("has correct name, tier, effects", () => {
    expect(draftAddUnitTool.name).toBe("course.draft_add_unit");
    expect(draftAddUnitTool.tier).toBe("grounded");
    expect(draftAddUnitTool.effects).toContain("artifact.mutate");
  });
});
