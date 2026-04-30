import { describe, expect, it } from "vitest";
import { getMode, homeworkMode, listModes, quizMode } from "../modes/index.js";

describe("homeworkMode", () => {
  it("getMode('homework') returns the homework mode", () => {
    const mode = getMode("homework");
    expect(mode).toBeDefined();
    expect(mode?.id).toBe("homework");
  });

  it("listModes includes homework", () => {
    expect(listModes().some((m) => m.id === "homework")).toBe(true);
  });

  it("homeworkMode toolNames matches quizMode toolNames", () => {
    expect(homeworkMode.toolNames).toEqual(quizMode.toolNames);
  });

  it("homeworkMode has role.homework fragment", () => {
    const role = homeworkMode.promptFragments.find((f) => f.id === "role.homework");
    expect(role).toBeDefined();
    expect(role?.customizable).toBe(true);
  });

  it("homeworkRoleFragment mentions workRubric authoring guidance", () => {
    const role = homeworkMode.promptFragments.find((f) => f.id === "role.homework");
    expect(role?.template).toContain("workRubric");
    expect(role?.template).toContain("assignment.create");
  });

  it("homeworkMode has assignment-context fragment", () => {
    const ids = homeworkMode.promptFragments.map((f) => f.id);
    expect(ids).toContain("context.assignment-state");
  });

  it("homeworkMode has uiSurface: 'chat'", () => {
    expect(homeworkMode.uiSurface).toBe("chat");
  });
});
