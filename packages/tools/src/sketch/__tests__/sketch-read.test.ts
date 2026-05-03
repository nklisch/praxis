import type { Sketch, SketchService, SketchSummary } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { sketchReadTool } from "../sketch-read.js";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const TEST_SKETCH_ID = brandId<"SketchId">("abc123");
const TEST_PNG = Buffer.from("fake-png-data");
const TEST_SNAPSHOT = { shapes: [], assets: {} };

function makeSketch(): Sketch {
  return {
    id: TEST_SKETCH_ID,
    snapshot: TEST_SNAPSHOT,
    image: TEST_PNG,
    width: 640,
    height: 320,
    createdAt: 1700000000000 as Sketch["createdAt"],
  };
}

function makeSketchService(overrides?: Partial<SketchService>): SketchService {
  return {
    put: vi.fn().mockResolvedValue({} as SketchSummary),
    get: vi.fn().mockResolvedValue(makeSketch()),
    getSummary: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

// ─── Helper: build a minimal ToolContext for sketch.read ───────────────────────

function makeCtx(sketches?: SketchService) {
  return {
    studentId: brandId<"StudentId">("student-1"),
    sessionId: brandId<"SessionId">("session-1"),
    services: {
      sketches,
      // biome-ignore lint/suspicious/noExplicitAny: test stub — only sketches is used in this test
    } as any,
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("sketchReadTool metadata", () => {
  it("has correct name", () => {
    expect(sketchReadTool.name).toBe("sketch.read");
  });

  it("has tier: deterministic", () => {
    expect(sketchReadTool.tier).toBe("deterministic");
  });

  it("has effects: none", () => {
    expect(sketchReadTool.effects).toContain("none");
  });
});

describe("sketchReadTool handler — success", () => {
  it("returns snapshot JSON and base64 image for a known sketch", async () => {
    const sketches = makeSketchService();
    const ctx = makeCtx(sketches);

    // biome-ignore lint/suspicious/noExplicitAny: partial ToolContext for test — only sketches service used
    const result = await sketchReadTool.handler({ sketchId: String(TEST_SKETCH_ID) }, ctx as any);

    expect(sketches.get).toHaveBeenCalledWith(TEST_SKETCH_ID);
    expect(result.snapshotJson).toBe(JSON.stringify(TEST_SNAPSHOT));
    expect(result.imageBase64).toBe(TEST_PNG.toString("base64"));
    expect(result.width).toBe(640);
    expect(result.height).toBe(320);
  });

  it("passes the sketchId to sketches.get correctly", async () => {
    const sketches = makeSketchService();
    const ctx = makeCtx(sketches);

    // biome-ignore lint/suspicious/noExplicitAny: partial ToolContext for test
    await sketchReadTool.handler({ sketchId: "abc123" }, ctx as any);

    expect(sketches.get).toHaveBeenCalledWith("abc123");
  });
});

describe("sketchReadTool handler — error cases", () => {
  it("throws when sketch service is unavailable", async () => {
    const ctx = makeCtx(undefined);

    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: partial ToolContext for test
      sketchReadTool.handler({ sketchId: "abc123" }, ctx as any),
    ).rejects.toThrow("Sketch service is not available");
  });

  it("propagates not_found error from the sketch service", async () => {
    const sketches = makeSketchService({
      get: vi.fn().mockRejectedValue(new Error("SketchService.get: sketch not found: abc123")),
    });
    const ctx = makeCtx(sketches);

    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: partial ToolContext for test
      sketchReadTool.handler({ sketchId: "abc123" }, ctx as any),
    ).rejects.toThrow("sketch not found");
  });
});
