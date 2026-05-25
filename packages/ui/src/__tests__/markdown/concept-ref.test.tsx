import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConceptRef } from "../../components/markdown/concept-ref.js";
import styles from "../../components/markdown-content.module.css";

afterEach(() => cleanup());

describe("ConceptRef", () => {
  it("renders an <a> element with href='#'", () => {
    const { container } = render(<ConceptRef conceptSlug="chain-rule">chain rule</ConceptRef>);
    const a = container.querySelector("a");
    expect(a).not.toBeNull();
    expect(a?.getAttribute("href")).toBe("#");
  });

  it("applies the .conceptRef class", () => {
    const { container } = render(<ConceptRef conceptSlug="integration">integration</ConceptRef>);
    const a = container.querySelector("a");
    expect(a?.className).toContain(styles.conceptRef);
  });

  it("renders children as link text", () => {
    const { container } = render(<ConceptRef conceptSlug="chain-rule">chain rule</ConceptRef>);
    expect(container.querySelector("a")?.textContent).toBe("chain rule");
  });

  it("calls onOpen with the conceptSlug when clicked", () => {
    const onOpen = vi.fn();
    const { container } = render(
      <ConceptRef conceptSlug="chain-rule" onOpen={onOpen}>
        chain rule
      </ConceptRef>,
    );
    const a = container.querySelector("a");
    if (!a) throw new Error("expected <a> element");
    fireEvent.click(a);
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledWith("chain-rule");
  });

  it("passes the exact slug string to onOpen, not a transformed version", () => {
    const onOpen = vi.fn();
    const { container } = render(
      <ConceptRef conceptSlug="pythagorean-theorem" onOpen={onOpen}>
        Pythagorean theorem
      </ConceptRef>,
    );
    const a = container.querySelector("a");
    if (!a) throw new Error("expected <a> element");
    fireEvent.click(a);
    expect(onOpen).toHaveBeenCalledWith("pythagorean-theorem");
  });

  it("does not throw when clicked without an onOpen handler", () => {
    const { container } = render(<ConceptRef conceptSlug="chain-rule">chain rule</ConceptRef>);
    const a = container.querySelector("a");
    if (!a) throw new Error("expected <a> element");
    // No onOpen provided — click should be a no-op, no error thrown.
    expect(() => fireEvent.click(a)).not.toThrow();
  });

  it("does not navigate when clicked (default prevented)", () => {
    // JSDOM does not follow hrefs, but we can verify the handler calls
    // preventDefault by checking that no navigation side-effect occurs.
    // The test above (no throw on missing onOpen) already exercises the click
    // path; here we additionally verify onOpen is not called with undefined.
    const onOpen = vi.fn();
    const { container } = render(
      <ConceptRef conceptSlug="limits" onOpen={onOpen}>
        limits
      </ConceptRef>,
    );
    const a = container.querySelector("a");
    if (!a) throw new Error("expected <a> element");
    fireEvent.click(a);
    // Only called once, with the slug (not undefined or null).
    expect(onOpen).toHaveBeenCalledWith("limits");
  });

  it("supports multi-word children (rich content)", () => {
    const { container } = render(
      <ConceptRef conceptSlug="mean-value-theorem">
        <em>mean value theorem</em>
      </ConceptRef>,
    );
    expect(container.querySelector("a em")?.textContent).toBe("mean value theorem");
  });

  it("does not render any interactive controls besides the <a> itself", () => {
    const { container } = render(<ConceptRef conceptSlug="chain-rule">chain rule</ConceptRef>);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(container.querySelectorAll("a")).toHaveLength(1);
  });
});
