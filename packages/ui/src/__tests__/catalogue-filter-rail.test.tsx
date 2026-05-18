/**
 * Tests for <CatalogueFilterRail>.
 *
 * Verifies:
 *  - Renders format and saved-filter groups.
 *  - Clicking a format pill updates the format facet.
 *  - Clicking an already-active format pill deselects it (back to "all").
 *  - Clicking a saved filter pill updates the saved facet.
 *  - Clicking an already-active saved filter deselects it (back to null).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CatalogueFilterRail,
  type CatalogueFilters,
  DEFAULT_FILTERS,
} from "../components/catalogue-filter-rail.js";

afterEach(() => cleanup());

function renderRail(filters: CatalogueFilters = DEFAULT_FILTERS, onChange = vi.fn()) {
  return render(<CatalogueFilterRail filters={filters} onChange={onChange} />);
}

describe("CatalogueFilterRail", () => {
  it("renders format group heading", () => {
    renderRail();
    expect(screen.getByText(/by format/i)).toBeDefined();
  });

  it("renders saved filter group heading", () => {
    renderRail();
    expect(screen.getByText(/saved/i)).toBeDefined();
  });

  it("renders All, Notes, Flashcards format pills", () => {
    renderRail();
    expect(screen.getByRole("button", { name: /^all$/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /^notes$/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /^flashcards$/i })).toBeDefined();
  });

  it("clicking Notes pill calls onChange with format: 'note'", () => {
    const onChange = vi.fn();
    renderRail(DEFAULT_FILTERS, onChange);

    fireEvent.click(screen.getByRole("button", { name: /^notes$/i }));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ format: "note" }));
  });

  it("clicking Flashcards pill calls onChange with format: 'flashcard'", () => {
    const onChange = vi.fn();
    renderRail(DEFAULT_FILTERS, onChange);

    fireEvent.click(screen.getByRole("button", { name: /^flashcards$/i }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ format: "flashcard" }));
  });

  it("clicking an active format pill deselects back to 'all'", () => {
    const onChange = vi.fn();
    renderRail({ format: "note", saved: null }, onChange);

    fireEvent.click(screen.getByRole("button", { name: /^notes$/i }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ format: "all" }));
  });

  it("clicking 'due for review' saved pill calls onChange with saved: 'due'", () => {
    const onChange = vi.fn();
    renderRail(DEFAULT_FILTERS, onChange);

    fireEvent.click(screen.getByRole("button", { name: /due for review/i }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ saved: "due" }));
  });

  it("clicking an active saved pill deselects it back to null", () => {
    const onChange = vi.fn();
    renderRail({ format: "all", saved: "due" }, onChange);

    fireEvent.click(screen.getByRole("button", { name: /due for review/i }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ saved: null }));
  });

  it("saved filter pills retain current format filter in the onChange call", () => {
    const onChange = vi.fn();
    renderRail({ format: "note", saved: null }, onChange);

    fireEvent.click(screen.getByRole("button", { name: /recent.*today/i }));

    expect(onChange).toHaveBeenCalledWith({ format: "note", saved: "recent" });
  });
});
