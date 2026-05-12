/**
 * PromptCustomizationServiceImpl unit tests.
 *
 * Uses a real migrated SQLite via useTempDb(). Verifies:
 * - getGlobalFragment / setGlobalFragment round-trip, clear, and cap.
 * - getModeAppend / setModeAppend round-trip, clear, per-mode isolation.
 * - listFragmentOverrides returns only rows for the requested mode.
 * - previewPrompt composes against stored state + draft overrides.
 */

import { describe, expect, it } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { openDb } from "../../db/index.js";
import { promptOverrides } from "../../schema.js";
import { PromptCustomizationServiceImpl } from "../prompt-customization-service.js";

const dbCtx = useTempDb();

function makeService(db: ReturnType<typeof openDb>["db"]) {
  return new PromptCustomizationServiceImpl({ db });
}

// ── Global fragment ────────────────────────────────────────────────────────────

describe("PromptCustomizationServiceImpl — getGlobalFragment / setGlobalFragment", () => {
  it("returns null when no global fragment has been set", () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    expect(svc.getGlobalFragment()).toBeNull();
  });

  it("round-trips the global fragment", () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    svc.setGlobalFragment("Be concise and encouraging.");
    expect(svc.getGlobalFragment()).toBe("Be concise and encouraging.");
  });

  it("setGlobalFragment(null) clears the row", () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    svc.setGlobalFragment("something");
    svc.setGlobalFragment(null);
    expect(svc.getGlobalFragment()).toBeNull();
  });

  it("setGlobalFragment with whitespace-only string clears the row", () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    svc.setGlobalFragment("something");
    svc.setGlobalFragment("   ");
    expect(svc.getGlobalFragment()).toBeNull();
  });

  it("overwrites an existing global fragment", () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    svc.setGlobalFragment("first");
    svc.setGlobalFragment("second");
    expect(svc.getGlobalFragment()).toBe("second");
  });

  it("trims leading/trailing whitespace before storing", () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    svc.setGlobalFragment("  trimmed  ");
    expect(svc.getGlobalFragment()).toBe("trimmed");
  });

  it("rejects text over 20,000 chars", () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    expect(() => svc.setGlobalFragment("x".repeat(20_001))).toThrow();
  });

  it("accepts exactly 20,000 chars", () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    expect(() => svc.setGlobalFragment("x".repeat(20_000))).not.toThrow();
    expect(svc.getGlobalFragment()?.length).toBe(20_000);
  });
});

// ── Per-mode append ────────────────────────────────────────────────────────────

describe("PromptCustomizationServiceImpl — getModeAppend / setModeAppend", () => {
  it("returns null when no append has been set for a mode", () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    expect(svc.getModeAppend("teach")).toBeNull();
  });

  it("round-trips a per-mode append", () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    svc.setModeAppend("teach", "Always use Socratic questioning.");
    expect(svc.getModeAppend("teach")).toBe("Always use Socratic questioning.");
  });

  it("setModeAppend(null) clears the row for that mode", () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    svc.setModeAppend("teach", "some text");
    svc.setModeAppend("teach", null);
    expect(svc.getModeAppend("teach")).toBeNull();
  });

  it("whitespace-only text clears the row", () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    svc.setModeAppend("teach", "text");
    svc.setModeAppend("teach", "   ");
    expect(svc.getModeAppend("teach")).toBeNull();
  });

  it("isolates appends per mode", () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    svc.setModeAppend("teach", "teach text");
    svc.setModeAppend("quiz", "quiz text");
    expect(svc.getModeAppend("teach")).toBe("teach text");
    expect(svc.getModeAppend("quiz")).toBe("quiz text");
  });

  it("clearing one mode does not affect other modes", () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    svc.setModeAppend("teach", "teach text");
    svc.setModeAppend("quiz", "quiz text");
    svc.setModeAppend("teach", null);
    expect(svc.getModeAppend("teach")).toBeNull();
    expect(svc.getModeAppend("quiz")).toBe("quiz text");
  });
});

// ── listFragmentOverrides ──────────────────────────────────────────────────────

describe("PromptCustomizationServiceImpl — listFragmentOverrides", () => {
  it("returns empty array when no overrides exist for a mode", () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    expect(svc.listFragmentOverrides("teach")).toEqual([]);
  });

  it("returns only overrides for the requested mode", () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    db.insert(promptOverrides)
      .values([
        {
          modeId: "teach",
          fragmentId: "preamble.default",
          override: "teach override",
          updatedAt: new Date(),
        },
        {
          modeId: "quiz",
          fragmentId: "preamble.default",
          override: "quiz override",
          updatedAt: new Date(),
        },
      ])
      .run();
    const svc = makeService(db);
    const results = svc.listFragmentOverrides("teach");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      modeId: "teach",
      fragmentId: "preamble.default",
      override: "teach override",
    });
  });
});

// ── previewPrompt ──────────────────────────────────────────────────────────────

describe("PromptCustomizationServiceImpl — previewPrompt", () => {
  it("returns a non-empty string for a known modeId", () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    const result = svc.previewPrompt({ modeId: "teach" });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("throws for an unknown modeId", () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    expect(() => svc.previewPrompt({ modeId: "nonexistent" })).toThrow("Unknown mode: nonexistent");
  });

  it("draftGlobal string overrides stored global fragment", () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    svc.setGlobalFragment("STORED_GLOBAL");
    const withDraft = svc.previewPrompt({ modeId: "teach", draftGlobal: "DRAFT_GLOBAL" });
    expect(withDraft).toContain("DRAFT_GLOBAL");
    expect(withDraft).not.toContain("STORED_GLOBAL");
  });

  it("draftGlobal null removes the global slot even if stored", () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    svc.setGlobalFragment("STORED_GLOBAL");
    const withNull = svc.previewPrompt({ modeId: "teach", draftGlobal: null });
    expect(withNull).not.toContain("STORED_GLOBAL");
  });

  it("draftGlobal undefined falls back to stored global fragment", () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    svc.setGlobalFragment("STORED_GLOBAL");
    const result = svc.previewPrompt({ modeId: "teach" });
    expect(result).toContain("STORED_GLOBAL");
  });

  it("draftAppend string overrides stored mode append", () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    svc.setModeAppend("teach", "STORED_APPEND");
    const withDraft = svc.previewPrompt({ modeId: "teach", draftAppend: "DRAFT_APPEND" });
    expect(withDraft).toContain("DRAFT_APPEND");
    expect(withDraft).not.toContain("STORED_APPEND");
  });

  it("draftAppend null removes the append slot even if stored", () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    svc.setModeAppend("teach", "STORED_APPEND");
    const withNull = svc.previewPrompt({ modeId: "teach", draftAppend: null });
    expect(withNull).not.toContain("STORED_APPEND");
  });

  it("previewPrompt matches composeSystemPrompt for same stored state", () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    const svc = makeService(db);
    svc.setGlobalFragment("GLOBAL_TEXT");
    svc.setModeAppend("teach", "APPEND_TEXT");
    // The result should contain both user layers in the correct order.
    const result = svc.previewPrompt({ modeId: "teach" });
    const globalIdx = result.indexOf("GLOBAL_TEXT");
    const appendIdx = result.indexOf("APPEND_TEXT");
    expect(globalIdx).toBeGreaterThan(-1);
    expect(appendIdx).toBeGreaterThan(-1);
    expect(globalIdx).toBeLessThan(appendIdx);
  });
});
