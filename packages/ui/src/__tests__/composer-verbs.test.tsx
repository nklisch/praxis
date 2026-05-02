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

  it("returns the bootstrap verb set for modeId 'bootstrap'", () => {
    const verbs = getVerbsForMode("bootstrap");
    expect(verbs).toEqual(VERBS_BY_MODE.bootstrap);
    expect(verbs.length).toBeGreaterThan(0);
  });

  it("falls back to the teach set for unknown modes (e.g. 'exam')", () => {
    const verbs = getVerbsForMode("exam");
    expect(verbs).toEqual(VERBS_BY_MODE.teach);
  });

  it("falls back to the teach set for 'quiz' mode", () => {
    const verbs = getVerbsForMode("quiz");
    expect(verbs).toEqual(VERBS_BY_MODE.teach);
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

  it("renders one chip per verb for the 'bootstrap' mode", () => {
    render(<ComposerVerbs modeId="bootstrap" onPrefill={vi.fn()} />);

    const bootstrapVerbs = VERBS_BY_MODE.bootstrap;
    for (const verb of bootstrapVerbs) {
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

  it("falls back to teach verbs for unknown modes and calls onPrefill correctly", () => {
    const onPrefill = vi.fn();
    render(<ComposerVerbs modeId="exam" onPrefill={onPrefill} />);

    // Should render the teach set
    const teachVerbs = VERBS_BY_MODE.teach;
    expect(screen.getAllByRole("button")).toHaveLength(teachVerbs.length);

    // First teach verb chip should work
    fireEvent.click(screen.getByRole("button", { name: "explain" }));
    expect(onPrefill).toHaveBeenCalledWith("explain ");
  });

  it("renders a toolbar landmark region", () => {
    render(<ComposerVerbs modeId="teach" onPrefill={vi.fn()} />);
    expect(screen.getByRole("toolbar")).toBeDefined();
  });
});
