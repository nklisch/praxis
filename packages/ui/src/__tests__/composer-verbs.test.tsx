import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComposerVerbs } from "../components/composer-verbs.js";
import { getVerbsForMode, VERBS_BY_MODE } from "../components/composer-verbs-meta.js";

afterEach(() => cleanup());

describe("getVerbsForMode", () => {
  it("returns the teach verb set for modeId 'teach'", () => {
    const verbs = getVerbsForMode("teach");
    expect(verbs).toEqual(VERBS_BY_MODE.teach);
    expect(verbs.length).toBeGreaterThan(0);
  });

  it("returns the course-create verb set for modeId 'course-create'", () => {
    const verbs = getVerbsForMode("course-create");
    expect(verbs).toEqual(VERBS_BY_MODE["course-create"]);
    expect(verbs.length).toBeGreaterThan(0);
  });

  it("returns the exam verb set for modeId 'exam'", () => {
    const verbs = getVerbsForMode("exam");
    expect(verbs).toEqual(VERBS_BY_MODE.exam);
    expect(verbs.length).toBeGreaterThan(0);
  });

  it("returns the quiz verb set for modeId 'quiz'", () => {
    const verbs = getVerbsForMode("quiz");
    expect(verbs).toEqual(VERBS_BY_MODE.quiz);
    expect(verbs.length).toBeGreaterThan(0);
  });

  it("returns an empty array when modeId is undefined", () => {
    const verbs = getVerbsForMode(undefined);
    expect(verbs).toHaveLength(0);
  });
});

describe("ComposerVerbs", () => {
  it("renders null when modeId is undefined", () => {
    const { container } = render(<ComposerVerbs modeId={undefined} onPrefill={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders one chip per verb for the 'teach' mode", () => {
    render(<ComposerVerbs modeId="teach" onPrefill={vi.fn()} />);

    const teachVerbs = VERBS_BY_MODE.teach;
    for (const verb of teachVerbs) {
      expect(screen.getByRole("button", { name: verb })).toBeDefined();
    }
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(teachVerbs.length);
  });

  it("renders one chip per verb for the 'course-create' mode", () => {
    render(<ComposerVerbs modeId="course-create" onPrefill={vi.fn()} />);

    const courseCreateVerbs = VERBS_BY_MODE["course-create"];
    for (const verb of courseCreateVerbs) {
      expect(screen.getByRole("button", { name: verb })).toBeDefined();
    }
  });

  it("tapping a chip calls onPrefill exactly once with the verb + trailing space", () => {
    const onPrefill = vi.fn();
    render(<ComposerVerbs modeId="teach" onPrefill={onPrefill} />);

    fireEvent.click(screen.getByRole("button", { name: "explain" }));

    expect(onPrefill).toHaveBeenCalledTimes(1);
    expect(onPrefill).toHaveBeenCalledWith("explain ");
  });

  it("passes the trailing space for multi-word verbs", () => {
    const onPrefill = vi.fn();
    render(<ComposerVerbs modeId="teach" onPrefill={onPrefill} />);

    fireEvent.click(screen.getByRole("button", { name: "quiz me on" }));

    expect(onPrefill).toHaveBeenCalledWith("quiz me on ");
  });

  it("falls back to teach verbs for truly unknown modes and calls onPrefill correctly", () => {
    const onPrefill = vi.fn();
    render(<ComposerVerbs modeId="unknown-mode-xyz" onPrefill={onPrefill} />);

    // Unknown modes should fall back to teach set
    const teachVerbs = VERBS_BY_MODE.teach;
    expect(screen.getAllByRole("button")).toHaveLength(teachVerbs.length);

    // First teach verb chip should work
    fireEvent.click(screen.getByRole("button", { name: "explain" }));
    expect(onPrefill).toHaveBeenCalledWith("explain ");
  });

  it("renders exam verbs for 'exam' mode", () => {
    const onPrefill = vi.fn();
    render(<ComposerVerbs modeId="exam" onPrefill={onPrefill} />);

    const examVerbs = VERBS_BY_MODE.exam;
    expect(screen.getAllByRole("button")).toHaveLength(examVerbs.length);
  });

  it("renders a toolbar landmark region", () => {
    render(<ComposerVerbs modeId="teach" onPrefill={vi.fn()} />);
    expect(screen.getByRole("toolbar")).toBeDefined();
  });
});
