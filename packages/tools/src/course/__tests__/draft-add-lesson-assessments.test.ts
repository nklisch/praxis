/**
 * Unit tests for course.draft_add_lesson_assessments (batch) tool handler.
 */
import type { BootstrapService } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { draftAddLessonAssessmentsTool } from "../draft-add-lesson-assessments.js";

const A = (
  draftLessonId: string,
  title: string,
  override?: Partial<{
    kind: "quiz" | "homework" | "exam";
    timing: "before" | "after" | "interleaved";
    purpose: "readiness" | "practice" | "checkpoint";
    expectedItemCount: number;
  }>,
) => ({
  draftLessonId,
  title,
  kind: override?.kind ?? ("homework" as const),
  timing: override?.timing ?? ("after" as const),
  purpose: override?.purpose ?? ("practice" as const),
  conceptNames: ["Variables"],
  ...(override?.expectedItemCount !== undefined && {
    expectedItemCount: override.expectedItemCount,
  }),
  rationale: "deliberate practice",
});

describe("course.draft_add_lesson_assessments handler", () => {
  it("happy path — every assessment added, ok:true", async () => {
    let n = 0;
    const bootstrap: Partial<BootstrapService> = {
      addLessonAssessment: vi.fn().mockImplementation(async () => {
        n++;
        return { ok: true, draftAssessmentId: `assess-${n}` };
      }),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as BootstrapService },
      draftId: "draft-1",
    });

    const result = await draftAddLessonAssessmentsTool.handler(
      { assessments: [A("l1", "HW 1"), A("l2", "HW 2"), A("l3", "HW 3")] },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(result.results).toHaveLength(3);
    expect(result.results.every((r) => r.ok)).toBe(true);
  });

  it("partial failure — unknown lesson reported per-item", async () => {
    const bootstrap: Partial<BootstrapService> = {
      addLessonAssessment: vi.fn().mockImplementation(async (input: { draftLessonId: string }) => {
        if (input.draftLessonId === "ghost") {
          return { ok: false, reason: 'lesson "ghost" not found in draft' };
        }
        return { ok: true, draftAssessmentId: "x" };
      }),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as BootstrapService },
      draftId: "draft-1",
    });

    const result = await draftAddLessonAssessmentsTool.handler(
      { assessments: [A("ghost", "Bad"), A("l1", "Good")] },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(result.results[0]?.ok).toBe(false);
    expect(result.results[1]?.ok).toBe(true);
    expect(bootstrap.addLessonAssessment).toHaveBeenCalledTimes(2);
  });

  it("forwards optional expectedItemCount", async () => {
    const bootstrap: Partial<BootstrapService> = {
      addLessonAssessment: vi.fn().mockResolvedValue({ ok: true, draftAssessmentId: "x" }),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as BootstrapService },
      draftId: "draft-1",
    });

    await draftAddLessonAssessmentsTool.handler(
      { assessments: [A("l1", "Quiz", { kind: "quiz", expectedItemCount: 5 })] },
      ctx,
    );

    expect(bootstrap.addLessonAssessment).toHaveBeenCalledWith(
      expect.objectContaining({ expectedItemCount: 5 }),
    );
  });

  it("has correct name, tier, effects", () => {
    expect(draftAddLessonAssessmentsTool.name).toBe("course.draft_add_lesson_assessments");
    expect(draftAddLessonAssessmentsTool.tier).toBe("grounded");
    expect(draftAddLessonAssessmentsTool.effects).toContain("artifact.mutate");
  });
});
