/**
 * Tests for MatchingBody component.
 * Uses the dropdown (keyboard) fallback path throughout since jsdom
 * doesn't support drag events well. The DnD path is smoke-tested by
 * checking that the left/right items render correctly.
 *
 * Note: window.matchMedia in the test setup returns matches:false, meaning
 * "no prefers-reduced-motion" and "not a coarse pointer" — so the DnD
 * layout renders by default. For dropdown tests we click the "use keyboard"
 * toggle to switch modes.
 */
import type { MatchingItem } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MatchingBody } from "../components/item-bodies/matching-body.js";

afterEach(() => {
  cleanup();
});

const item: MatchingItem = {
  kind: "matching",
  id: "mt1",
  prompt: "Match the animals",
  leftItems: [
    { id: "l1", text: "Dog" },
    { id: "l2", text: "Cat" },
  ],
  rightItems: [
    { id: "r1", text: "Woof" },
    { id: "r2", text: "Meow" },
  ],
  correctPairs: [
    { leftId: "l1", rightId: "r1" },
    { leftId: "l2", rightId: "r2" },
  ],
};

describe("MatchingBody — DnD mode (default in jsdom)", () => {
  it("renders left and right items", () => {
    render(<MatchingBody item={item} response="" onChange={() => {}} />);
    expect(screen.getByText("Dog")).toBeDefined();
    expect(screen.getByText("Cat")).toBeDefined();
    expect(screen.getByText("Woof")).toBeDefined();
    expect(screen.getByText("Meow")).toBeDefined();
  });

  it("shows 'use keyboard' toggle button", () => {
    render(<MatchingBody item={item} response="" onChange={() => {}} />);
    expect(screen.getByText("use keyboard")).toBeDefined();
  });

  it("switches to dropdown mode when 'use keyboard' is clicked", () => {
    render(<MatchingBody item={item} response="" onChange={() => {}} />);
    fireEvent.click(screen.getByText("use keyboard"));
    // After toggle, dropdown selects appear
    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(2); // one per left item
  });
});

describe("MatchingBody — keyboard (dropdown) fallback", () => {
  function renderDropdown(response = "", onChange = () => {}) {
    render(<MatchingBody item={item} response={response} onChange={onChange} />);
    fireEvent.click(screen.getByText("use keyboard"));
  }

  it("renders dropdowns for each left item", () => {
    renderDropdown();
    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(2);
  });

  it("initial value is empty (no selection)", () => {
    renderDropdown();
    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
    for (const sel of selects) {
      expect(sel.value).toBe("");
    }
  });

  it("selecting a right item calls onChange with the pair", () => {
    const onChange = vi.fn();
    renderDropdown("", onChange);
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0]!, { target: { value: "r1" } });
    const call = onChange.mock.calls[0]?.[0] as string;
    const pairs = JSON.parse(call);
    expect(pairs).toContainEqual({ leftId: "l1", rightId: "r1" });
  });

  it("reflects existing pairs in dropdown values", () => {
    const response = JSON.stringify([
      { leftId: "l1", rightId: "r1" },
      { leftId: "l2", rightId: "r2" },
    ]);
    renderDropdown(response);
    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
    expect(selects[0]?.value).toBe("r1");
    expect(selects[1]?.value).toBe("r2");
  });

  it("changing a selection updates the pair", () => {
    const onChange = vi.fn();
    const response = JSON.stringify([{ leftId: "l1", rightId: "r1" }]);
    renderDropdown(response, onChange);
    const selects = screen.getAllByRole("combobox");
    // Switch l1 from r1 to r2
    fireEvent.change(selects[0]!, { target: { value: "r2" } });
    const call = onChange.mock.calls[0]?.[0] as string;
    const pairs = JSON.parse(call);
    expect(pairs).toContainEqual({ leftId: "l1", rightId: "r2" });
    expect(
      pairs.every(
        (p: { leftId: string; rightId: string }) => !(p.leftId === "l1" && p.rightId === "r1"),
      ),
    ).toBe(true);
  });

  it("disables dropdowns when disabled=true", () => {
    render(<MatchingBody item={item} response="" onChange={() => {}} disabled={true} />);
    // disabled mode forces dropdown fallback
    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
    for (const sel of selects) {
      expect(sel.disabled).toBe(true);
    }
  });
});
