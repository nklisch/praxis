import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "../theme-toggle.js";

const STORAGE_KEY = "praxis.theme.preference";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("ThemeToggle", () => {
  it("renders 3 buttons: auto, light, dark", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "auto" })).toBeDefined();
    expect(screen.getByRole("button", { name: "light" })).toBeDefined();
    expect(screen.getByRole("button", { name: "dark" })).toBeDefined();
  });

  it("auto button is aria-pressed=true by default (no stored pref)", () => {
    render(<ThemeToggle />);
    const autoBtn = screen.getByRole("button", { name: "auto" });
    expect(autoBtn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "light" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(screen.getByRole("button", { name: "dark" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("clicking dark button sets data-theme=dark and marks dark as active", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "dark" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("button", { name: "dark" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "auto" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("clicking light button sets data-theme=light", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "light" }));

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: "light" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("clicking auto after an explicit pref removes data-theme", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "dark" }));
    fireEvent.click(screen.getByRole("button", { name: "auto" }));

    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(screen.getByRole("button", { name: "auto" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("choice persists to localStorage on click", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "light" }));
    expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
  });

  it("renders separator glyphs between buttons", () => {
    render(<ThemeToggle />);
    // There should be 2 separator "·" characters
    const seps = screen.getAllByText("·");
    expect(seps).toHaveLength(2);
  });
});
