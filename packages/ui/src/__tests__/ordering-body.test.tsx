/**
 * Tests for OrderingBody component.
 * Focuses on keyboard up/down reorder buttons (drag-and-drop tested
 * via the keyboard fallback path for portability).
 *
 * Note: @dnd-kit renders additional accessible buttons for DnD interactions.
 * We query move buttons by aria-label to target only the up/down controls.
 */
import type { OrderingItem } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrderingBody } from "../components/item-bodies/ordering-body.js";

afterEach(() => {
  cleanup();
});

const item: OrderingItem = {
  kind: "ordering",
  id: "or1",
  prompt: "Order the steps",
  items: [
    { id: "a", text: "Step A" },
    { id: "b", text: "Step B" },
    { id: "c", text: "Step C" },
  ],
  correctOrder: ["a", "b", "c"],
};

describe("OrderingBody", () => {
  it("renders all items", () => {
    render(<OrderingBody item={item} response="" onChange={() => {}} />);
    expect(screen.getByText("Step A")).toBeDefined();
    expect(screen.getByText("Step B")).toBeDefined();
    expect(screen.getByText("Step C")).toBeDefined();
  });

  it("renders up/down buttons for each item (by aria-label)", () => {
    render(<OrderingBody item={item} response="" onChange={() => {}} />);
    // Each item has aria-labeled move buttons
    expect(screen.getByRole("button", { name: 'move "Step A" up' })).toBeDefined();
    expect(screen.getByRole("button", { name: 'move "Step A" down' })).toBeDefined();
    expect(screen.getByRole("button", { name: 'move "Step B" up' })).toBeDefined();
    expect(screen.getByRole("button", { name: 'move "Step B" down' })).toBeDefined();
    expect(screen.getByRole("button", { name: 'move "Step C" up' })).toBeDefined();
    expect(screen.getByRole("button", { name: 'move "Step C" down' })).toBeDefined();
  });

  it("first item's up button is disabled", () => {
    render(<OrderingBody item={item} response="" onChange={() => {}} />);
    const upBtn = screen.getByRole("button", {
      name: 'move "Step A" up',
    }) as HTMLButtonElement;
    expect(upBtn.disabled).toBe(true);
  });

  it("last item's down button is disabled", () => {
    render(<OrderingBody item={item} response="" onChange={() => {}} />);
    const downBtn = screen.getByRole("button", {
      name: 'move "Step C" down',
    }) as HTMLButtonElement;
    expect(downBtn.disabled).toBe(true);
  });

  it("clicking up button on second item swaps with first", () => {
    const onChange = vi.fn();
    render(<OrderingBody item={item} response="" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: 'move "Step B" up' }));
    expect(onChange).toHaveBeenCalledWith('["b","a","c"]');
  });

  it("clicking down button on first item swaps with second", () => {
    const onChange = vi.fn();
    render(<OrderingBody item={item} response="" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: 'move "Step A" down' }));
    expect(onChange).toHaveBeenCalledWith('["b","a","c"]');
  });

  it("applies custom response order — verifies text content by querying items", () => {
    render(<OrderingBody item={item} response='["c","a","b"]' onChange={() => {}} />);
    // In dnd-kit's sortable, items are rendered in the provided order.
    // Query each step text and verify it's present (order verified by DOM position
    // via textContent of the ol's children — we check Step C appears before Step A).
    const allText = document.body.textContent ?? "";
    const posC = allText.indexOf("Step C");
    const posA = allText.indexOf("Step A");
    const posB = allText.indexOf("Step B");
    expect(posC).toBeLessThan(posA);
    expect(posA).toBeLessThan(posB);
  });

  it("disables move buttons when disabled=true", () => {
    render(<OrderingBody item={item} response="" onChange={() => {}} disabled={true} />);
    const upA = screen.getByRole("button", { name: 'move "Step A" up' }) as HTMLButtonElement;
    const downA = screen.getByRole("button", { name: 'move "Step A" down' }) as HTMLButtonElement;
    expect(upA.disabled).toBe(true);
    expect(downA.disabled).toBe(true);
  });
});
