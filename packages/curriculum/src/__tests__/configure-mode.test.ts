/**
 * Configure mode — Phase 11 registration tests.
 *
 * Verifies that configure mode is present in the MODE_REGISTRY, has the
 * expected prompt fragments, and includes the expected tool names.
 */
import { describe, expect, it } from "vitest";
import { configureMode } from "../modes/configure.js";
import { getMode, listModes, requireMode } from "../modes/index.js";

describe("configure mode registration", () => {
  it("getMode('configure') returns the configure mode", () => {
    const mode = getMode("configure");
    expect(mode).toBeDefined();
    expect(mode?.id).toBe("configure");
  });

  it("listModes includes configure", () => {
    const modes = listModes();
    expect(modes.some((m) => m.id === "configure")).toBe(true);
  });

  it("requireMode('configure') does not throw", () => {
    expect(() => requireMode("configure")).not.toThrow();
  });
});

describe("configure mode surface + role", () => {
  it("has uiSurface 'configure'", () => {
    expect(configureMode.uiSurface).toBe("configure");
  });

  it("has requiredRole 'configurator'", () => {
    expect(configureMode.requiredRole).toBe("configurator");
  });
});

describe("configure mode prompt fragments", () => {
  it("has at least 2 prompt fragments (role + tools)", () => {
    expect(configureMode.promptFragments.length).toBeGreaterThanOrEqual(2);
  });

  it("has a 'role' position fragment", () => {
    const roleFragment = configureMode.promptFragments.find((f) => f.position === "role");
    expect(roleFragment).toBeDefined();
    expect(roleFragment?.id).toBe("role.configure");
    expect(roleFragment?.customizable).toBe(true);
  });

  it("has a 'tools' position fragment", () => {
    const toolsFragment = configureMode.promptFragments.find((f) => f.position === "tools");
    expect(toolsFragment).toBeDefined();
    expect(toolsFragment?.id).toBe("tools.configure");
    expect(toolsFragment?.customizable).toBe(false);
  });
});

describe("configure mode toolNames", () => {
  it("includes authoring tools", () => {
    const names = configureMode.toolNames;
    expect(names).toContain("course.edit");
    expect(names).toContain("lesson.create");
    expect(names).toContain("lesson.edit");
    expect(names).toContain("lesson.delete");
    expect(names).toContain("gate.create");
    expect(names).toContain("gate.edit");
    expect(names).toContain("gate.delete");
    expect(names).toContain("gate.override");
    expect(names).toContain("prompt.override_fragment");
    expect(names).toContain("prompt.clear_fragment");
    expect(names).toContain("prompt.set_style");
  });

  it("includes configure-mode memory tools", () => {
    const names = configureMode.toolNames;
    expect(names).toContain("memory.reset_concept");
    expect(names).toContain("memory.clear_misconception");
    expect(names).toContain("memory.export");
    expect(names).toContain("memory.delete_all");
  });

  it("includes bootstrap tools", () => {
    const names = configureMode.toolNames;
    expect(names).toContain("course.propose_draft");
    expect(names).toContain("course.use_canonical_pack");
  });

  it("does not include teach-mode tools like update_mastery or record_misconception", () => {
    const names = configureMode.toolNames;
    expect(names).not.toContain("update_mastery");
    expect(names).not.toContain("record_misconception");
  });
});
