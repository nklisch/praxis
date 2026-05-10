import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { makeEmptyPedagogyPackService, PedagogyPackServiceImpl } from "../pedagogy-pack-service.js";

const FIXTURES_DIR = join(fileURLToPath(import.meta.url), "..", "fixtures");
const SYNTHETIC_PACK_PATH = join(FIXTURES_DIR, "synthetic-pack.json");

function makeLogger() {
  const log = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    // biome-ignore lint/suspicious/noExplicitAny: logger child() returns same shape
    child: vi.fn((): any => log),
  };
  return log;
}

// ─── empty-pack mode ──────────────────────────────────────────────────────────

describe("PedagogyPackServiceImpl — empty-pack mode (file absent)", () => {
  const log = makeLogger();
  const svc = new PedagogyPackServiceImpl({
    log,
    packPath: "/tmp/pedagogy-pack-definitely-does-not-exist-xyzzy.json",
  });

  it("logs pack_absent once", () => {
    expect(log.info).toHaveBeenCalledWith("pedagogy.pack_absent", expect.objectContaining({ path: expect.any(String) }));
  });

  it("current() returns null", () => {
    expect(svc.current()).toBeNull();
  });

  it("listStrategies() returns empty array", () => {
    expect(svc.listStrategies()).toEqual([]);
  });

  it("getStrategy() returns null", () => {
    expect(svc.getStrategy(brandId<"StrategyId">("worked-examples"))).toBeNull();
  });

  it("listTechniques() returns empty array", () => {
    expect(svc.listTechniques()).toEqual([]);
  });

  it("getTechnique() returns null", () => {
    expect(svc.getTechnique(brandId<"TechniqueId">("spaced-repetition"))).toBeNull();
  });

  it("listMetacognitivePrompts() returns empty array", () => {
    expect(svc.listMetacognitivePrompts()).toEqual([]);
  });

  it("listMetacognitivePrompts({ trigger }) returns empty array", () => {
    expect(svc.listMetacognitivePrompts({ trigger: "pre-reading" })).toEqual([]);
  });
});

// ─── makeEmptyPedagogyPackService helper ──────────────────────────────────────

describe("makeEmptyPedagogyPackService", () => {
  it("returns a service in empty-pack mode without throwing", () => {
    const svc = makeEmptyPedagogyPackService();
    expect(svc.current()).toBeNull();
    expect(svc.listStrategies()).toEqual([]);
    expect(svc.listTechniques()).toEqual([]);
    expect(svc.listMetacognitivePrompts()).toEqual([]);
  });
});

// ─── invalid-JSON mode ────────────────────────────────────────────────────────

describe("PedagogyPackServiceImpl — invalid JSON file", () => {
  it("logs pack_invalid_json and falls back to empty mode", async () => {
    const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");

    const dir = await mkdtemp(join(tmpdir(), "praxis-pedagogy-test-"));
    const badPath = join(dir, "bad.json");
    await writeFile(badPath, "{ this is not valid json }}}", "utf8");

    const log = makeLogger();
    const svc = new PedagogyPackServiceImpl({ log, packPath: badPath });

    expect(log.error).toHaveBeenCalledWith(
      "pedagogy.pack_invalid_json",
      expect.objectContaining({ path: badPath }),
    );
    expect(svc.current()).toBeNull();

    await rm(dir, { recursive: true });
  });
});

// ─── shape-mismatch mode ──────────────────────────────────────────────────────

describe("PedagogyPackServiceImpl — shape-mismatch file", () => {
  it("logs pack_invalid_shape and falls back to empty mode", async () => {
    const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");

    const dir = await mkdtemp(join(tmpdir(), "praxis-pedagogy-test-"));
    const badPath = join(dir, "mismatch.json");
    // Valid JSON but missing required fields (no version, no manifest.authors).
    await writeFile(badPath, JSON.stringify({ version: "1.0.0", manifest: { name: "Oops" } }), "utf8");

    const log = makeLogger();
    const svc = new PedagogyPackServiceImpl({ log, packPath: badPath });

    expect(log.error).toHaveBeenCalledWith(
      "pedagogy.pack_invalid_shape",
      expect.objectContaining({ path: badPath, issues: expect.any(Array) }),
    );
    expect(svc.current()).toBeNull();

    await rm(dir, { recursive: true });
  });
});

// ─── valid synthetic pack ─────────────────────────────────────────────────────

describe("PedagogyPackServiceImpl — valid synthetic pack", () => {
  const log = makeLogger();
  const svc = new PedagogyPackServiceImpl({ log, packPath: SYNTHETIC_PACK_PATH });

  it("logs pack_loaded with correct counts", () => {
    expect(log.info).toHaveBeenCalledWith(
      "pedagogy.pack_loaded",
      expect.objectContaining({ strategies: 2, techniques: 1, prompts: 2 }),
    );
  });

  it("current() returns the pack", () => {
    const pack = svc.current();
    expect(pack).not.toBeNull();
    expect(pack?.version).toBe("0.1.0");
    expect(pack?.manifest.name).toBe("Synthetic Test Pack");
  });

  it("listStrategies() returns all strategies", () => {
    const strategies = svc.listStrategies();
    expect(strategies).toHaveLength(2);
    expect(strategies[0]?.id).toBe("worked-examples");
    expect(strategies[1]?.id).toBe("socratic");
  });

  it("getStrategy() returns the correct strategy by id", () => {
    const s = svc.getStrategy(brandId<"StrategyId">("worked-examples"));
    expect(s).not.toBeNull();
    expect(s?.name).toBe("Worked Examples");
    expect(s?.applicability.cognitiveLoad).toBe("medium");
  });

  it("getStrategy() returns null for unknown id", () => {
    expect(svc.getStrategy(brandId<"StrategyId">("unknown-id"))).toBeNull();
  });

  it("listTechniques() returns all techniques", () => {
    const techniques = svc.listTechniques();
    expect(techniques).toHaveLength(1);
    expect(techniques[0]?.id).toBe("spaced-repetition");
  });

  it("getTechnique() returns the correct technique by id", () => {
    const t = svc.getTechnique(brandId<"TechniqueId">("spaced-repetition"));
    expect(t).not.toBeNull();
    expect(t?.curriculum.lessons).toHaveLength(1);
    expect(t?.curriculum.lessons[0]?.id).toBe("sr-intro");
  });

  it("getTechnique() returns null for unknown id", () => {
    expect(svc.getTechnique(brandId<"TechniqueId">("unknown-id"))).toBeNull();
  });

  it("listMetacognitivePrompts() returns all prompts", () => {
    expect(svc.listMetacognitivePrompts()).toHaveLength(2);
  });

  it("listMetacognitivePrompts({ trigger: 'pre-reading' }) filters correctly", () => {
    const prompts = svc.listMetacognitivePrompts({ trigger: "pre-reading" });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.id).toBe("pre-reading-goals");
  });

  it("listMetacognitivePrompts({ trigger: 'post-error' }) filters correctly", () => {
    const prompts = svc.listMetacognitivePrompts({ trigger: "post-error" });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.id).toBe("post-error-reflect");
  });

  it("listMetacognitivePrompts({ trigger: 'session-end' }) returns empty for trigger with no prompts", () => {
    expect(svc.listMetacognitivePrompts({ trigger: "session-end" })).toHaveLength(0);
  });
});

// ─── schema: duplicate-id rejection ──────────────────────────────────────────

describe("PedagogyPackSchema — cross-validation", () => {
  it("rejects packs with duplicate strategy ids", async () => {
    const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");

    const dir = await mkdtemp(join(tmpdir(), "praxis-pedagogy-test-"));
    const badPath = join(dir, "dup-strategy.json");

    const pack = {
      version: "0.1.0",
      signature: "v1-unsigned",
      manifest: { name: "X", description: "Y", praxisCompatible: ">=0.1.0", publishedAt: 1, authors: ["A"] },
      strategies: [
        { id: "s1", name: "S1", description: "d", applicability: { conceptKinds: [], bloomsLevels: [], cognitiveLoad: "low" }, promptFragment: "p", citations: [] },
        { id: "s1", name: "S1-dup", description: "d", applicability: { conceptKinds: [], bloomsLevels: [], cognitiveLoad: "low" }, promptFragment: "p", citations: [] },
      ],
    };
    await writeFile(badPath, JSON.stringify(pack), "utf8");

    const log = makeLogger();
    const svc = new PedagogyPackServiceImpl({ log, packPath: badPath });
    expect(svc.current()).toBeNull();
    expect(log.error).toHaveBeenCalledWith("pedagogy.pack_invalid_shape", expect.anything());

    await rm(dir, { recursive: true });
  });

  it("rejects packs with empty manifest.authors", async () => {
    const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");

    const dir = await mkdtemp(join(tmpdir(), "praxis-pedagogy-test-"));
    const badPath = join(dir, "no-authors.json");

    const pack = {
      version: "0.1.0",
      signature: "v1-unsigned",
      manifest: { name: "X", description: "Y", praxisCompatible: ">=0.1.0", publishedAt: 1, authors: [] },
    };
    await writeFile(badPath, JSON.stringify(pack), "utf8");

    const log = makeLogger();
    const svc = new PedagogyPackServiceImpl({ log, packPath: badPath });
    expect(svc.current()).toBeNull();

    await rm(dir, { recursive: true });
  });
});
