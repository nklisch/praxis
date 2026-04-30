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
import type {
  BootstrapService,
  ConceptGraphId,
  CourseId,
  ImportedPackView,
  PackImportService,
  StudentId,
  ToolContext,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { useCanonicalPackTool } from "../use-canonical-pack.js";

const STUDENT_ID = brandId<"StudentId">("student-ucp");
const SESSION_ID = brandId<"SessionId">("session-ucp");
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

function makeBootstrapService(
  courseId = "course-ucp-1",
  conceptCount = 42,
): Partial<BootstrapService> {
  return {
    createCourseFromPack: vi.fn().mockResolvedValue({ courseId, conceptCount }),
  };
}

function makeCtx(packs: PackImportService, bootstrap: Partial<BootstrapService>): ToolContext {
  return {
    studentId: STUDENT_ID,
    sessionId: SESSION_ID,
    services: {
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      courseState: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      memory: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      artifacts: null as any,
      bootstrap: bootstrap as BootstrapService,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      vectorStore: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      ftsStore: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      embeddings: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      documents: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      sandbox: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      sympy: null as any,
      pedagogyPack: null,
      lock: null as any,
      authoring: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: Phase 12 — not used in this test
      notes: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: Phase 12 — not used in this test
      flashcards: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: Phase 12 — not used in this test
      fsrsScheduler: null as any,
      packs,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      assignments: null as any,
    },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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
    const bootstrap = makeBootstrapService();
    const ctx = makeCtx(packs, bootstrap);

    await useCanonicalPackTool.handler(
      { packId: PACK_ID, courseTitle: "Algebra 1", gradeLevel: "9-12" },
      ctx,
    );

    expect(packs.importPack).toHaveBeenCalledWith(PACK_ID);
  });

  it("calls createCourseFromPack with the returned conceptGraphId", async () => {
    const packs = makePacksService();
    const bootstrap = makeBootstrapService();
    const ctx = makeCtx(packs, bootstrap);

    await useCanonicalPackTool.handler(
      { packId: PACK_ID, courseTitle: "Algebra 1", gradeLevel: "9-12" },
      ctx,
    );

    expect(bootstrap.createCourseFromPack).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: STUDENT_ID,
        packId: PACK_ID,
        conceptGraphId: GRAPH_ID,
        courseTitle: "Algebra 1",
        gradeLevel: "9-12",
      }),
    );
  });

  it("returns ok: true with courseId, conceptGraphId, and conceptCount", async () => {
    const packs = makePacksService();
    const bootstrap = makeBootstrapService("course-abc-123", 42);
    const ctx = makeCtx(packs, bootstrap);

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
    const bootstrap = makeBootstrapService();
    const ctx = makeCtx(packs, bootstrap);

    await expect(
      useCanonicalPackTool.handler(
        { packId: "unknown-pack", courseTitle: "X", gradeLevel: "9-12" },
        ctx,
      ),
    ).rejects.toThrow("Pack not found");
  });

  it("propagates error when createCourseFromPack throws", async () => {
    const packs = makePacksService();
    const bootstrap = makeBootstrapService();
    vi.mocked(bootstrap.createCourseFromPack!).mockRejectedValue(
      new Error("no concepts found for conceptGraphId"),
    );
    const ctx = makeCtx(packs, bootstrap);

    await expect(
      useCanonicalPackTool.handler(
        { packId: PACK_ID, courseTitle: "Algebra 1", gradeLevel: "9-12" },
        ctx,
      ),
    ).rejects.toThrow("no concepts found");
  });
});
