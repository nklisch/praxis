/**
 * Env-gate tests for `PRAXIS_DEV` dev-tool registration.
 *
 * `buildServices` is a heavyweight orchestrator (DB, embeddings workers,
 * Pyodide host, etc.) and cannot be invoked in a unit test. Instead we
 * test the gate logic at its source of truth — the same env-predicate and
 * the same `DEV_TOOLS` export that `services.ts` uses — and verify both
 * gate states produce the right tool set.
 *
 * What is under test:
 *   1. `DEV_TOOLS` exports `dev.report_issue` (step-1 prereq contract).
 *   2. When `PRAXIS_DEV === "true"`, applying the gate includes `dev.*` tools.
 *   3. When `PRAXIS_DEV` is unset, the gate excludes every `dev.*` tool.
 *   4. `createDevReportsWriter` is defined and returns a writer with the
 *      expected interface when the gate is on.
 */

import { createDevReportsWriter, DEV_TOOLS } from "@praxis/tools/dev";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Simulates the gate logic from `services.ts`:
 *   const IS_DEV = process.env.PRAXIS_DEV === "true";
 *   if (IS_DEV) toolDefinitions.push(...DEV_TOOLS);
 *
 * Returns the assembled tool-name set so assertions stay readable.
 */
function assembleToolNames(baseProd: string[] = []): string[] {
  const IS_DEV = process.env.PRAXIS_DEV === "true";
  const result = [...baseProd];
  if (IS_DEV) {
    result.push(...DEV_TOOLS.map((t) => t.name));
  }
  return result;
}

/**
 * Simulates the devReportsWriter gate from `services.ts`:
 *   devReportsWriter: IS_DEV ? createDevReportsWriter() : undefined,
 */
function resolveDevReportsWriter() {
  const IS_DEV = process.env.PRAXIS_DEV === "true";
  return IS_DEV ? createDevReportsWriter() : undefined;
}

// ── env isolation ─────────────────────────────────────────────────────────────

let savedEnv: string | undefined;

beforeEach(() => {
  savedEnv = process.env.PRAXIS_DEV;
  delete process.env.PRAXIS_DEV;
});

afterEach(() => {
  if (savedEnv === undefined) {
    delete process.env.PRAXIS_DEV;
  } else {
    process.env.PRAXIS_DEV = savedEnv;
  }
});

// ── DEV_TOOLS shape (step-1 contract) ────────────────────────────────────────

describe("DEV_TOOLS export (step-1 contract)", () => {
  it("contains dev.report_issue", () => {
    const names = DEV_TOOLS.map((t) => t.name);
    expect(names).toContain("dev.report_issue");
  });

  it("every tool name starts with 'dev.'", () => {
    for (const tool of DEV_TOOLS) {
      expect(tool.name).toMatch(/^dev\./);
    }
  });
});

// ── gate ON: PRAXIS_DEV === 'true' ────────────────────────────────────────────

describe("PRAXIS_DEV=true (gate on)", () => {
  beforeEach(() => {
    process.env.PRAXIS_DEV = "true";
  });

  it("gate includes dev.report_issue in toolDefinitions", () => {
    const names = assembleToolNames();
    expect(names).toContain("dev.report_issue");
  });

  it("gate includes all DEV_TOOLS names", () => {
    const names = assembleToolNames();
    for (const tool of DEV_TOOLS) {
      expect(names).toContain(tool.name);
    }
  });

  it("devReportsWriter is defined", () => {
    const writer = resolveDevReportsWriter();
    expect(writer).toBeDefined();
  });

  it("devReportsWriter exposes writeReport function", () => {
    const writer = resolveDevReportsWriter();
    expect(typeof writer?.writeReport).toBe("function");
  });
});

// ── gate OFF: PRAXIS_DEV unset ────────────────────────────────────────────────

describe("PRAXIS_DEV unset (gate off)", () => {
  it("toolDefinitions does not include any dev.* tool", () => {
    const names = assembleToolNames();
    const devNames = names.filter((n) => n.startsWith("dev."));
    expect(devNames).toHaveLength(0);
  });

  it("dev.report_issue is absent", () => {
    const names = assembleToolNames();
    expect(names).not.toContain("dev.report_issue");
  });

  it("devReportsWriter is undefined", () => {
    const writer = resolveDevReportsWriter();
    expect(writer).toBeUndefined();
  });
});

// ── gate OFF: PRAXIS_DEV=false (explicit falsy string) ────────────────────────

describe("PRAXIS_DEV=false (gate off — falsy string)", () => {
  beforeEach(() => {
    process.env.PRAXIS_DEV = "false";
  });

  it("toolDefinitions does not include any dev.* tool", () => {
    const names = assembleToolNames();
    const devNames = names.filter((n) => n.startsWith("dev."));
    expect(devNames).toHaveLength(0);
  });

  it("devReportsWriter is undefined", () => {
    const writer = resolveDevReportsWriter();
    expect(writer).toBeUndefined();
  });
});

// ── production tool set isolation ────────────────────────────────────────────

describe("gate isolation — prod tools unaffected", () => {
  it("existing prod tools are present regardless of gate state", () => {
    const prodTools = ["existing.tool.one", "existing.tool.two"];

    delete process.env.PRAXIS_DEV;
    const offNames = assembleToolNames(prodTools);
    expect(offNames).toEqual(expect.arrayContaining(prodTools));

    process.env.PRAXIS_DEV = "true";
    const onNames = assembleToolNames(prodTools);
    expect(onNames).toEqual(expect.arrayContaining(prodTools));
  });
});
