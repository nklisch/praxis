/**
 * Tests for MultiSelectBody component.
 */
import type { MultiSelectItem } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MultiSelectBody } from "../components/item-bodies/multi-select-body.js";

afterEach(() => {
  cleanup();
});

const item: MultiSelectItem = {
  kind: "multi-select",
  id: "ms1",
  prompt: "Pick all correct",
  options: ["Alpha", "Beta", "Gamma"],
  correctOptionIndices: [0, 2],
};

describe("MultiSelectBody", () => {
  it("renders checkboxes for each option", () => {
    render(<MultiSelectBody item={item} response="" onChange={() => {}} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });

  it("none checked by default when response is empty", () => {
    render(<MultiSelectBody item={item} response="" onChange={() => {}} />);
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    for (const box of boxes) {
      expect(box.checked).toBe(false);
    }
  });

  it("reflects checked state from response", () => {
    render(<MultiSelectBody item={item} response="[0,2]" onChange={() => {}} />);
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes[0]?.checked).toBe(true);
    expect(boxes[1]?.checked).toBe(false);
    expect(boxes[2]?.checked).toBe(true);
  });

  it("calls onChange with added index when checking", () => {
    const onChange = vi.fn();
    render(<MultiSelectBody item={item} response="" onChange={onChange} />);
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[0]!);
    expect(onChange).toHaveBeenCalledWith("[0]");
  });

  it("calls onChange with removed index when unchecking", () => {
    const onChange = vi.fn();
    render(<MultiSelectBody item={item} response="[0,1]" onChange={onChange} />);
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[0]!);
    expect(onChange).toHaveBeenCalledWith("[1]");
  });

  it("adds index in sorted order", () => {
    const onChange = vi.fn();
    render(<MultiSelectBody item={item} response="[2]" onChange={onChange} />);
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[0]!);
    expect(onChange).toHaveBeenCalledWith("[0,2]");
  });

  it("disables checkboxes when disabled=true", () => {
    render(<MultiSelectBody item={item} response="" onChange={() => {}} disabled={true} />);
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    for (const box of boxes) {
      expect(box.disabled).toBe(true);
    }
  });
});
