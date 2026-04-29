import { describe, expect, it, vi } from "vitest";
import { LocalEmbeddingService } from "../embeddings.js";

// Fast mock — never loads the real model
vi.mock("@huggingface/transformers", () => ({
  pipeline: vi.fn((_task: string, _modelId: string) =>
    Promise.resolve(async (inputs: string | string[], _opts: unknown) => {
      const texts = Array.isArray(inputs) ? inputs : [inputs];
      const dimension = 384;
      // Return deterministic fake embeddings: index i in text → value i/1000
      const flat = new Float32Array(texts.length * dimension);
      for (let i = 0; i < texts.length; i++) {
        // Give each text a distinct embedding: fill with text.charCodeAt(0) / 1000
        const val = (texts[i]?.charCodeAt(0) ?? 0) / 1000;
        for (let j = 0; j < dimension; j++) {
          flat[i * dimension + j] = val;
        }
      }
      return { data: flat, dims: [texts.length, dimension] };
    }),
  ),
}));

describe("LocalEmbeddingService (fast, mocked pipeline)", () => {
  it("has correct modelId and dimension defaults", () => {
    const svc = new LocalEmbeddingService();
    expect(svc.modelId).toBe("Xenova/bge-small-en-v1.5");
    expect(svc.dimension).toBe(384);
  });

  it("embed() returns a vector of length 384", async () => {
    const svc = new LocalEmbeddingService();
    const vec = await svc.embed("hello world");
    expect(vec).toHaveLength(384);
    expect(vec.every((v) => typeof v === "number")).toBe(true);
  });

  it("embedQuery() returns a different vector than embed() for same input", async () => {
    const svc = new LocalEmbeddingService();
    const passageVec = await svc.embed("hello");
    const queryVec = await svc.embedQuery("hello");
    // embedQuery prepends a prefix, so the first char is different → different embedding
    expect(passageVec[0]).not.toBe(queryVec[0]);
  });

  it("embedBatch() returns N vectors of length 384", async () => {
    const svc = new LocalEmbeddingService();
    const vecs = await svc.embedBatch(["alpha", "beta", "gamma"]);
    expect(vecs).toHaveLength(3);
    for (const v of vecs) {
      expect(v).toHaveLength(384);
    }
  });

  it("embedBatch([]) returns empty array", async () => {
    const svc = new LocalEmbeddingService();
    const vecs = await svc.embedBatch([]);
    expect(vecs).toHaveLength(0);
  });

  it("concurrent embed calls share the same pipeline load", async () => {
    const { pipeline } = await import("@huggingface/transformers");
    // Clear call count from previous tests before checking
    vi.clearAllMocks();
    const svc = new LocalEmbeddingService();
    await Promise.all([svc.embed("a"), svc.embed("b"), svc.embed("c")]);
    // pipeline should be called only once despite 3 concurrent requests
    expect(pipeline).toHaveBeenCalledTimes(1);
  });

  it("preload() resolves without error", async () => {
    const svc = new LocalEmbeddingService();
    await expect(svc.preload()).resolves.toBeUndefined();
  });

  it("custom modelId and dimension are honored", () => {
    const svc = new LocalEmbeddingService({ modelId: "custom/model", dimension: 768 });
    expect(svc.modelId).toBe("custom/model");
    expect(svc.dimension).toBe(768);
  });
});

describe("LocalEmbeddingService (slow — real model)", () => {
  // Gated by PRAXIS_RUN_SLOW_TESTS=1
  const runSlow = !!process.env.PRAXIS_RUN_SLOW_TESTS;

  it.skipIf(!runSlow)(
    "loads real bge-small-en-v1.5 and embeds text",
    { timeout: 120_000 },
    async () => {
      // Undo mock for this test by importing fresh
      vi.resetModules();
      const { LocalEmbeddingService: RealSvc } = await import("../embeddings.js");
      const svc = new RealSvc();
      const vec = await svc.embed("What is photosynthesis?");
      expect(vec).toHaveLength(384);
      // Values should be normalized (L2 norm ≈ 1)
      const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
      expect(norm).toBeCloseTo(1, 1);
    },
  );
});
