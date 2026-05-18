/**
 * Tests for <CatalogueSearchBox>.
 *
 * Verifies:
 *  - Renders the placeholder text.
 *  - Does NOT call onSearchChange immediately on keystroke (debounce).
 *  - Calls onSearchChange with the current value after 250 ms.
 *  - Renders resultCount when provided.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogueSearchBox } from "../components/catalogue-search-box.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CatalogueSearchBox", () => {
  it("renders the search input with expected placeholder", () => {
    render(<CatalogueSearchBox onSearchChange={vi.fn()} />);
    const input = screen.getByRole("searchbox");
    expect(input).toBeDefined();
    expect((input as HTMLInputElement).placeholder).toContain("search notes");
  });

  it("does not call onSearchChange immediately on input change (debounce)", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<CatalogueSearchBox onSearchChange={onChange} />);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "chain" } });

    // Still within debounce window — must not have fired
    expect(onChange).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("calls onSearchChange after 250 ms debounce with typed value", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<CatalogueSearchBox onSearchChange={onChange} />);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "limits" } });
    vi.advanceTimersByTime(250);

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("limits");

    vi.useRealTimers();
  });

  it("debounces rapid keystrokes — only fires once for the final value", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<CatalogueSearchBox onSearchChange={onChange} />);

    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "c" } });
    vi.advanceTimersByTime(100);
    fireEvent.change(input, { target: { value: "ch" } });
    vi.advanceTimersByTime(100);
    fireEvent.change(input, { target: { value: "chain" } });
    vi.advanceTimersByTime(250);

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("chain");

    vi.useRealTimers();
  });

  it("renders result count when provided", () => {
    render(<CatalogueSearchBox onSearchChange={vi.fn()} resultCount={12} />);
    expect(screen.getByText(/12 results/i)).toBeDefined();
  });

  it("shows singular 'result' when count is 1", () => {
    render(<CatalogueSearchBox onSearchChange={vi.fn()} resultCount={1} />);
    expect(screen.getByText(/1 result/i)).toBeDefined();
  });

  it("does not render count when resultCount is omitted", () => {
    render(<CatalogueSearchBox onSearchChange={vi.fn()} />);
    expect(screen.queryByText(/result/i)).toBeNull();
  });
});
