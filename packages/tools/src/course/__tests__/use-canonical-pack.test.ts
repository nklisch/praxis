/**
 * Unit tests for course.use_canonical_pack — Phase 10.
 *
 * Pure stub tests: no DB. Verifies tool orchestrates packs.importPack then
 * bootstrap.createCourseFromPack, and returns the correct shape.
 *
 * Covers:
 *  - Calls importPack with the packId
 *  - Calls createCourseFromPack with the returned conceptGraphId
 *  - Returns ok: true with courseId and conceptCount
 *  - Propagates errors from importPack
 *  - Propagates errors from createCourseFromPack
 *  - Tool name, tier, and effects are correct
 */
import type { CourseCreateService, ImportedPackView, PackImportService } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { useCanonicalPackTool } from "../use-canonical-pack.js";

const PACK_ID = "algebra-1";
const GRAPH_ID = brandId<"ConceptGraphId">("graph-ucp-1");

const IMPORTED_PACK: ImportedPackView = {
  packId: PACK_ID,
  version: "1.0.0",
  conceptGraphId: GRAPH_ID,
  importedAt: Date.now(),
};

function makePacksService(imported: ImportedPackView = IMPORTED_PACK): PackImportService {
  return {
    listAvailablePacks: vi.fn(),
    importPack: vi.fn().mockResolvedValue(imported),
    listImportedPacks: vi.fn(),
    findPackBySubject: vi.fn(),
    getConceptGraphForPack: vi.fn(),
  } as PackImportService;
}

function makeCourseCreateService(
  courseId = "course-ucp-1",
  conceptCount = 42,
): Partial<CourseCreateService> {
  return {
    createCourseFromPack: vi.fn().mockResolvedValue({ courseId, conceptCount }),
  };
}

describe("course.use_canonical_pack", () => {
  it("tool metadata: name, tier, effects", () => {
    expect(useCanonicalPackTool.name).toBe("course.use_canonical_pack");
    expect(useCanonicalPackTool.tier).toBe("grounded");
    expect(useCanonicalPackTool.effects).toContain("artifact.mutate");
  });

  it("calls importPack with the given packId", async () => {
    const packs = makePacksService();
    const bootstrap = makeCourseCreateService();
    const ctx = makeToolContext({
      studentId: "student-ucp",
      sessionId: "session-ucp",
      services: { packs, bootstrap: bootstrap as CourseCreateService },
    });

    await useCanonicalPackTool.handler(
      { packId: PACK_ID, courseTitle: "Algebra 1", gradeLevel: "9-12" },
      ctx,
    );

    expect(packs.importPack).toHaveBeenCalledWith(PACK_ID);
  });

  it("calls createCourseFromPack with the returned conceptGraphId", async () => {
    const packs = makePacksService();
    const bootstrap = makeCourseCreateService();
    const ctx = makeToolContext({
      studentId: "student-ucp",
      sessionId: "session-ucp",
      services: { packs, bootstrap: bootstrap as CourseCreateService },
    });

    await useCanonicalPackTool.handler(
      { packId: PACK_ID, courseTitle: "Algebra 1", gradeLevel: "9-12" },
      ctx,
    );

    expect(bootstrap.createCourseFromPack).toHaveBeenCalledWith(
      expect.objectContaining({
        packId: PACK_ID,
        conceptGraphId: GRAPH_ID,
        courseTitle: "Algebra 1",
        gradeLevel: "9-12",
      }),
    );
  });

  it("returns ok: true with courseId, conceptGraphId, and conceptCount", async () => {
    const packs = makePacksService();
    const bootstrap = makeCourseCreateService("course-abc-123", 42);
    const ctx = makeToolContext({
      studentId: "student-ucp",
      sessionId: "session-ucp",
      services: { packs, bootstrap: bootstrap as CourseCreateService },
    });

    const result = await useCanonicalPackTool.handler(
      { packId: PACK_ID, courseTitle: "Algebra 1", gradeLevel: "9-12" },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(result.courseId).toBe("course-abc-123");
    expect(result.conceptGraphId).toBe(GRAPH_ID);
    expect(result.conceptCount).toBe(42);
  });

  it("propagates error when importPack throws", async () => {
    const packs = makePacksService();
    vi.mocked(packs.importPack).mockRejectedValue(new Error("Pack not found: unknown-pack"));
    const bootstrap = makeCourseCreateService();
    const ctx = makeToolContext({
      studentId: "student-ucp",
      sessionId: "session-ucp",
      services: { packs, bootstrap: bootstrap as CourseCreateService },
    });

    await expect(
      useCanonicalPackTool.handler(
        { packId: "unknown-pack", courseTitle: "X", gradeLevel: "9-12" },
        ctx,
      ),
    ).rejects.toThrow("Pack not found");
  });

  it("propagates error when createCourseFromPack throws", async () => {
    const packs = makePacksService();
    const bootstrap = makeCourseCreateService();
    vi.mocked(bootstrap.createCourseFromPack!).mockRejectedValue(
      new Error("no concepts found for conceptGraphId"),
    );
    const ctx = makeToolContext({
      studentId: "student-ucp",
      sessionId: "session-ucp",
      services: { packs, bootstrap: bootstrap as CourseCreateService },
    });

    await expect(
      useCanonicalPackTool.handler(
        { packId: PACK_ID, courseTitle: "Algebra 1", gradeLevel: "9-12" },
        ctx,
      ),
    ).rejects.toThrow("no concepts found");
  });
});
