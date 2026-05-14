/**
 * Tests for <ResizeHandle> primitive.
 *
 * Verifies the rendered element exposes the ARIA contract that screen readers
 * and assistive tech rely on, and that the side-specific class differs so the
 * hairline lands at the correct edge.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResizeHandle } from "../resize-handle.js";

afterEach(() => cleanup());

function makeProps(
  overrides: Partial<Parameters<typeof ResizeHandle>[0]> = {},
): Parameters<typeof ResizeHandle>[0] {
  return {
    side: "right",
    role: "separator" as const,
    "aria-orientation": "vertical" as const,
    "aria-valuenow": 220,
    "aria-valuemin": 160,
    "aria-valuemax": 480,
    "aria-label": "Resize right edge",
    tabIndex: 0 as const,
    onPointerDown: vi.fn(),
    onKeyDown: vi.fn(),
    ...overrides,
  };
}

describe("<ResizeHandle>", () => {
  it("renders with role='separator'", () => {
    render(<ResizeHandle {...makeProps()} />);
    expect(screen.getByRole("separator")).toBeDefined();
  });

  it("forwards aria-orientation='vertical'", () => {
    render(<ResizeHandle {...makeProps()} />);
    expect(screen.getByRole("separator").getAttribute("aria-orientation")).toBe("vertical");
  });

  it("forwards a numeric aria-valuenow", () => {
    render(<ResizeHandle {...makeProps({ "aria-valuenow": 300 })} />);
    expect(screen.getByRole("separator").getAttribute("aria-valuenow")).toBe("300");
  });

  it("is keyboard-focusable (tabIndex=0)", () => {
    render(<ResizeHandle {...makeProps()} />);
    expect(screen.getByRole("separator").getAttribute("tabindex")).toBe("0");
  });

  it("applies a side-specific class for left vs right", () => {
    const { unmount } = render(<ResizeHandle {...makeProps({ side: "right" })} />);
    const rightCls = screen.getByRole("separator").getAttribute("class") ?? "";
    unmount();
    render(<ResizeHandle {...makeProps({ side: "left" })} />);
    const leftCls = screen.getByRole("separator").getAttribute("class") ?? "";
    expect(rightCls).not.toBe(leftCls);
  });

  it("appends a caller-provided className", () => {
    render(<ResizeHandle {...makeProps()} className="custom-cls" />);
    const cls = screen.getByRole("separator").getAttribute("class") ?? "";
    expect(cls).toContain("custom-cls");
  });
});
