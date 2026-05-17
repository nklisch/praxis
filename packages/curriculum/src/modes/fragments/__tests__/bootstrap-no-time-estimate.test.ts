import { describe, expect, it } from "vitest";
import { bootstrapRoleFragment } from "../bootstrap-role.js";
import { bootstrapToolsFragment } from "../bootstrap-tools.js";
import { configureToolsFragment } from "../configure-tools.js";

describe("bootstrap fragments — no time-estimate claims", () => {
  for (const [name, frag] of [
    ["bootstrapRoleFragment", bootstrapRoleFragment],
    ["bootstrapToolsFragment", bootstrapToolsFragment],
    ["configureToolsFragment", configureToolsFragment],
  ] as const) {
    describe(name, () => {
      it("does not contain the literal '30–90 seconds'", () => {
        expect(frag.template).not.toContain("30–90 seconds");
      });
      it("does not contain the literal '30 seconds'", () => {
        expect(frag.template).not.toContain("30 seconds");
      });
      it("does not contain 'this'll take a bit'", () => {
        expect(frag.template).not.toContain("this'll take a bit");
      });
    });
  }
});

describe("bootstrapRoleFragment — structural-progress guidance", () => {
  it("forbids promising a specific duration", () => {
    expect(bootstrapRoleFragment.template).toContain("Do NOT promise a specific duration");
  });
  it("directs the model to describe progress in structural terms", () => {
    expect(bootstrapRoleFragment.template).toContain("structural terms");
  });
  it("gives a Unit-N-of-M style example", () => {
    expect(bootstrapRoleFragment.template).toMatch(/Unit \d+ of \d+/);
  });
});

describe("bootstrapToolsFragment + configureToolsFragment — ETA rule in tool catalogue", () => {
  it("bootstrapToolsFragment instructs not to quote ETAs", () => {
    expect(bootstrapToolsFragment.template).toContain("do not quote ETAs");
  });
  it("configureToolsFragment instructs not to quote ETAs", () => {
    expect(configureToolsFragment.template).toContain("do not quote ETAs");
  });
});
