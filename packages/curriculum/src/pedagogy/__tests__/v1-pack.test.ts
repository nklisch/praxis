/**
 * Smoke test for the bundled v1 pedagogy pack.
 *
 * Loads the real v1.json via the default pack path (no packPath override) and
 * asserts content thresholds and a couple of representative lookups. This is
 * deliberately a count/existence test — no assertions on specific description
 * text so it doesn't break when prose is refined.
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { PedagogyPackServiceImpl } from "../pedagogy-pack-service.js";

// Resolve the default pack path the same way the service does so tests pass
// whether run from source (praxis-source TS condition) or built dist/.
const dir = join(fileURLToPath(import.meta.url), "..", "..", "..");
const V1_PACK_PATH = join(dir, "..", "pedagogy", "v1.json");

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

describe("v1 pedagogy pack — content thresholds", () => {
  const log = makeLogger();
  const svc = new PedagogyPackServiceImpl({ log, packPath: V1_PACK_PATH });

  it("loads without validation errors", () => {
    expect(log.error).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("logs pedagogy.pack_loaded with non-zero counts", () => {
    expect(log.info).toHaveBeenCalledWith(
      "pedagogy.pack_loaded",
      expect.objectContaining({
        strategies: expect.any(Number),
        techniques: expect.any(Number),
        prompts: expect.any(Number),
      }),
    );
    const call = log.info.mock.calls.find((c: unknown[]) => c[0] === "pedagogy.pack_loaded") as [
      string,
      { strategies: number; techniques: number; prompts: number },
    ];
    expect(call[1].strategies).toBeGreaterThan(0);
    expect(call[1].techniques).toBeGreaterThan(0);
    expect(call[1].prompts).toBeGreaterThan(0);
  });

  it("has at least 5 strategies", () => {
    expect(svc.listStrategies().length).toBeGreaterThanOrEqual(5);
  });

  it("has at least 4 study techniques", () => {
    expect(svc.listTechniques().length).toBeGreaterThanOrEqual(4);
  });

  it("has at least 12 metacognitive prompts", () => {
    expect(svc.listMetacognitivePrompts().length).toBeGreaterThanOrEqual(12);
  });

  it("has at least 2 prompts for every trigger", () => {
    const triggers = [
      "pre-reading",
      "post-reading",
      "pre-quiz",
      "post-error",
      "session-end",
    ] as const;
    for (const trigger of triggers) {
      expect(
        svc.listMetacognitivePrompts({ trigger }).length,
        `trigger "${trigger}" must have ≥2 prompts`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("every strategy has at least one citation", () => {
    for (const s of svc.listStrategies()) {
      expect(s.citations.length, `strategy "${s.id}" must have ≥1 citation`).toBeGreaterThanOrEqual(
        1,
      );
    }
  });

  it("every technique has at least one citation", () => {
    for (const t of svc.listTechniques()) {
      expect(
        t.citations.length,
        `technique "${t.id}" must have ≥1 citation`,
      ).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("v1 pedagogy pack — representative lookups", () => {
  const log = makeLogger();
  const svc = new PedagogyPackServiceImpl({ log, packPath: V1_PACK_PATH });

  it("getStrategy('worked-examples') returns a strategy with citations", () => {
    const s = svc.getStrategy(brandId<"StrategyId">("worked-examples"));
    expect(s).not.toBeNull();
    expect(s?.citations.length).toBeGreaterThanOrEqual(1);
    expect(s?.applicability.cognitiveLoad).toBeDefined();
  });

  it("getStrategy('retrieval-practice') returns a strategy", () => {
    const s = svc.getStrategy(brandId<"StrategyId">("retrieval-practice"));
    expect(s).not.toBeNull();
    expect(s?.promptFragment.length).toBeGreaterThan(10);
  });

  it("getTechnique('spaced-repetition') returns a technique with lessons", () => {
    const t = svc.getTechnique(brandId<"TechniqueId">("spaced-repetition"));
    expect(t).not.toBeNull();
    expect(t?.curriculum.lessons.length).toBeGreaterThanOrEqual(3);
    expect(t?.uiAffordances).toContain("flashcard-review");
  });

  it("getTechnique('cornell-notes') returns a technique with cornell-note-editor affordance", () => {
    const t = svc.getTechnique(brandId<"TechniqueId">("cornell-notes"));
    expect(t).not.toBeNull();
    expect(t?.uiAffordances).toContain("cornell-note-editor");
  });

  it("listMetacognitivePrompts({ trigger: 'post-error' }) returns at least 2 prompts", () => {
    const prompts = svc.listMetacognitivePrompts({ trigger: "post-error" });
    expect(prompts.length).toBeGreaterThanOrEqual(2);
    // Each prompt must have a non-empty template
    for (const p of prompts) {
      expect(p.template.length).toBeGreaterThan(10);
    }
  });
});
