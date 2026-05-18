/**
 * Unit tests for course.draft_add_lessons (batch) tool handler.
 */
import type { CourseCreateService } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { draftAddLessonsTool } from "../draft-add-lessons.js";

describe("course.draft_add_lessons handler", () => {
  it("happy path — order preserved, lessonCount reflects total", async () => {
    let i = 0;
    const bootstrap: Partial<CourseCreateService> = {
      addLesson: vi.fn().mockImplementation(async () => {
        const lessonIndex = i;
        i++;
        return { ok: true, lessonIndex };
      }),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as CourseCreateService },
      draftId: "draft-1",
    });

    const result = await draftAddLessonsTool.handler(
      {
        lessons: [
          { title: "Lesson A", conceptNames: ["X"], references: [] },
          { title: "Lesson B", conceptNames: ["Y"], references: [] },
        ],
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(result.lessonCount).toBe(2);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]?.ok).toBe(true);
    if (result.results[0]?.ok) expect(result.results[0].lessonIndex).toBe(0);
    if (result.results[1]?.ok) expect(result.results[1].lessonIndex).toBe(1);
  });

  it("partial failure — unknown concept reported per-item, subsequent lessons still attempted", async () => {
    let i = 0;
    const bootstrap: Partial<CourseCreateService> = {
      addLesson: vi.fn().mockImplementation(async (input: { conceptNames: string[] }) => {
        if (input.conceptNames.includes("Ghost")) {
          return { ok: false, reason: 'concept "Ghost" not found — add it first' };
        }
        const lessonIndex = i;
        i++;
        return { ok: true, lessonIndex };
      }),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as CourseCreateService },
      draftId: "draft-1",
    });

    const result = await draftAddLessonsTool.handler(
      {
        lessons: [
          { title: "Bad", conceptNames: ["Ghost"], references: [] },
          { title: "Good", conceptNames: ["X"], references: [] },
        ],
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(result.results[0]?.ok).toBe(false);
    expect(result.results[1]?.ok).toBe(true);
    expect(bootstrap.addLesson).toHaveBeenCalledTimes(2);
  });

  it("forwards optional fields (suggestedStrategy, estimatedMinutes)", async () => {
    const bootstrap: Partial<CourseCreateService> = {
      addLesson: vi.fn().mockResolvedValue({ ok: true, lessonIndex: 0 }),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as CourseCreateService },
      draftId: "draft-1",
    });

    await draftAddLessonsTool.handler(
      {
        lessons: [
          {
            title: "L",
            conceptNames: ["X"],
            references: [],
            suggestedStrategy: "spaced-retrieval",
            estimatedMinutes: 60,
          },
        ],
      },
      ctx,
    );

    expect(bootstrap.addLesson).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestedStrategy: "spaced-retrieval",
        estimatedMinutes: 60,
      }),
    );
  });

  it("has correct name, tier, effects", () => {
    expect(draftAddLessonsTool.name).toBe("course.draft_add_lessons");
    expect(draftAddLessonsTool.tier).toBe("grounded");
    expect(draftAddLessonsTool.effects).toContain("artifact.mutate");
  });
});
