/**
 * Unit tests for course.list_canonical_packs — Phase 10.
 *
 * Pure stub tests: no DB. Verifies tool routes to packs service and
 * applies optional subject filter correctly.
 *
 * Covers:
 *  - Returns all packs when no subject filter is given
 *  - Filters by subject when subject is provided
 *  - Returns empty array when no packs match the subject filter
 *  - Tool name, tier, and effects are correct
 */
import type { PackImportService, PackSummaryView, ToolContext } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { listCanonicalPacksTool } from "../list-canonical-packs.js";

const STUDENT_ID = brandId<"StudentId">("student-lcp");
const SESSION_ID = brandId<"SessionId">("session-lcp");

const SAMPLE_PACKS: PackSummaryView[] = [
  {
    id: "algebra-1",
    version: "1.0.0",
    name: "Algebra 1",
    subject: "math.algebra-1",
    gradeLevel: "9-12",
    conceptCount: 42,
    edgeCount: 80,
    imported: false,
  },
  {
    id: "geometry",
    version: "1.0.0",
    name: "Geometry",
    subject: "math.geometry",
    gradeLevel: "9-12",
    conceptCount: 38,
    edgeCount: 65,
    imported: true,
  },
];

function makeCtx(packs: PackImportService): ToolContext {
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
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      bootstrap: null as any,
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
      packs,
      // biome-ignore lint/suspicious/noExplicitAny: test stub
      assignments: null as any,
    },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

function makePacksService(packs: PackSummaryView[]): PackImportService {
  return {
    listAvailablePacks: vi.fn().mockResolvedValue(packs),
    // biome-ignore lint/suspicious/noExplicitAny: test stub — not called in these tests
    importPack: vi.fn() as any,
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    listImportedPacks: vi.fn() as any,
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    findPackBySubject: vi.fn() as any,
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    getConceptGraphForPack: vi.fn() as any,
  };
}

describe("course.list_canonical_packs", () => {
  it("tool metadata: name, tier, effects", () => {
    expect(listCanonicalPacksTool.name).toBe("course.list_canonical_packs");
    expect(listCanonicalPacksTool.tier).toBe("grounded");
    expect(listCanonicalPacksTool.effects).toEqual(["none"]);
  });

  it("returns all packs when no subject filter is given", async () => {
    const service = makePacksService(SAMPLE_PACKS);
    const ctx = makeCtx(service);

    const result = await listCanonicalPacksTool.handler({}, ctx);

    expect(result.packs).toHaveLength(2);
    expect(service.listAvailablePacks).toHaveBeenCalledOnce();
  });

  it("filters packs by subject when provided", async () => {
    const service = makePacksService(SAMPLE_PACKS);
    const ctx = makeCtx(service);

    const result = await listCanonicalPacksTool.handler({ subject: "math.algebra-1" }, ctx);

    expect(result.packs).toHaveLength(1);
    expect(result.packs[0]?.id).toBe("algebra-1");
  });

  it("returns empty array when subject filter matches nothing", async () => {
    const service = makePacksService(SAMPLE_PACKS);
    const ctx = makeCtx(service);

    const result = await listCanonicalPacksTool.handler({ subject: "science.biology" }, ctx);

    expect(result.packs).toHaveLength(0);
  });

  it("returns empty array when no packs exist", async () => {
    const service = makePacksService([]);
    const ctx = makeCtx(service);

    const result = await listCanonicalPacksTool.handler({}, ctx);

    expect(result.packs).toHaveLength(0);
  });

  it("pack entries include all required fields", async () => {
    const service = makePacksService(SAMPLE_PACKS);
    const ctx = makeCtx(service);

    const result = await listCanonicalPacksTool.handler({}, ctx);

    const pack = result.packs[0];
    expect(pack).toHaveProperty("id");
    expect(pack).toHaveProperty("version");
    expect(pack).toHaveProperty("name");
    expect(pack).toHaveProperty("subject");
    expect(pack).toHaveProperty("gradeLevel");
    expect(pack).toHaveProperty("conceptCount");
    expect(pack).toHaveProperty("edgeCount");
    expect(pack).toHaveProperty("imported");
  });
});
