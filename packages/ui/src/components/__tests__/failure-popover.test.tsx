/**
 * Tests for <FailurePopover /> — inline failure detail popover.
 *
 * Verifies:
 * - Renders label, reason, action buttons
 * - Default label falls back to COPY.actionPip.failedLabel
 * - No reason paragraph when `reason` is undefined
 * - Multiple action buttons rendered and clickable
 * - Correct role="dialog" for accessibility
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COPY } from "../../lib/copy.js";
import { FailurePopover } from "../failure-popover.js";

afterEach(() => cleanup());

describe("FailurePopover", () => {
  it("renders with role='dialog'", () => {
    render(<FailurePopover actions={[]} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("renders the default label from COPY", () => {
    render(<FailurePopover actions={[]} />);
    expect(screen.getByText(COPY.actionPip.failedLabel)).toBeTruthy();
  });

  it("renders a custom label", () => {
    render(<FailurePopover label="Custom Failure" actions={[]} />);
    expect(screen.getByText("Custom Failure")).toBeTruthy();
  });

  it("renders the reason text when provided", () => {
    render(<FailurePopover reason="Network unavailable" actions={[]} />);
    expect(screen.getByText("Network unavailable")).toBeTruthy();
  });

  it("does not render a reason paragraph when reason is undefined", () => {
    render(<FailurePopover actions={[]} />);
    // If there's no reason, there should be no <p> element (only label div + actions div).
    const paragraphs = document.querySelectorAll("p");
    expect(paragraphs.length).toBe(0);
  });

  it("renders all action buttons", () => {
    render(
      <FailurePopover
        actions={[
          { label: "Retry", onClick: vi.fn() },
          { label: "Dismiss", onClick: vi.fn() },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
  });

  it("calls the action onClick when a button is clicked", () => {
    const onRetry = vi.fn();
    const onDismiss = vi.fn();

    render(
      <FailurePopover
        actions={[
          { label: "Retry", onClick: onRetry, variant: "primary" },
          { label: "Dismiss", onClick: onDismiss, variant: "secondary" },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("renders no buttons when actions array is empty", () => {
    render(<FailurePopover actions={[]} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
