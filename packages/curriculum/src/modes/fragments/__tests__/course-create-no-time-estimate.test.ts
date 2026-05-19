import { describe, expect, it } from "vitest";
import { configureToolsFragment } from "../configure-tools.js";
import { courseCreateRoleFragment } from "../course-create-role.js";
import { courseCreateToolsFragment } from "../course-create-tools.js";

describe("course-create fragments — no time-estimate claims", () => {
  for (const [name, frag] of [
    ["courseCreateRoleFragment", courseCreateRoleFragment],
    ["courseCreateToolsFragment", courseCreateToolsFragment],
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

describe("courseCreateRoleFragment — structural-progress guidance", () => {
  it("forbids promising a specific duration", () => {
    expect(courseCreateRoleFragment.template).toContain("Do NOT promise a specific duration");
  });
  it("directs the model to describe progress in structural terms", () => {
    expect(courseCreateRoleFragment.template).toContain("structural terms");
  });
  it("gives a Unit-N-of-M style example", () => {
    expect(courseCreateRoleFragment.template).toMatch(/Unit \d+ of \d+/);
  });
});

describe("courseCreateToolsFragment + configureToolsFragment — ETA rule in tool catalogue", () => {
  it("courseCreateToolsFragment instructs not to quote ETAs", () => {
    expect(courseCreateToolsFragment.template).toContain("do not quote ETAs");
  });
  it("configureToolsFragment instructs not to quote ETAs", () => {
    expect(configureToolsFragment.template).toContain("do not quote ETAs");
  });
});
